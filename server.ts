import express, { Request } from "express";
import {setTimeout} from 'timers/promises';
import { FlowProducer, Job, JobsOptions, Queue, QueueEvents } from "bullmq";
import { GetHeightsJob } from "./jobs";
import { batchLargeInputArr, cartographicArrayClusteringForHeightRequests } from "./utils";
import { Cartographic, CesiumTerrainProvider, Resource, sampleTerrainMostDetailed } from "cesium";


const app = express();
// Terrain setup
const terrainProvider = new CesiumTerrainProvider({
    url: new Resource({
        url: 'https://assets.ion.cesium.com/1/',
        headers: {
          'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZGRhMDg3ZC04ODIwLTRmYTYtYTE1OC1iMTAxNDJjN2VhYTciLCJpZCI6MjU5LCJhc3NldHMiOnsiMSI6eyJ0eXBlIjoiVEVSUkFJTiIsImV4dGVuc2lvbnMiOlt0cnVlLHRydWUsdHJ1ZV0sInB1bGxBcGFydFRlcnJhaW4iOmZhbHNlfX0sInNyYyI6Ijc4NmQwNDM5LTdkYmMtNDNlZS1iOWZjLThmYzljZTA3M2EyZiIsImlhdCI6MTY4MTkyMTQ5MSwiZXhwIjoxNjgxOTI1MDkxfQ.18BiJubdJRsjalyxgDqNeFcrpy5DRo39FjIubs8CKYQ',
        },
        queryParameters: {           
            extensions: "octvertexnormals-watermask-metadata"
        }

     }),
    // requestWaterMask: true,
    // requestVertexNormals: true,
});

const redisOptions = { host: "localhost", port: 5050 };

// QUEUE SETUP
const heightsQueue = new Queue("heightsQueue", { connection: redisOptions });
const getHeightFlowsQueue = new Queue("getHeightFlowsQueue", { connection: redisOptions });
const getHeightsFlowProducer = new FlowProducer({ connection: redisOptions });

// UTILITIES
const addFlowToHeightsQueue = (jobs: (GetHeightsJob & { opts?: JobsOptions })[], reqId: string) => {
    return getHeightsFlowProducer.add({
        name: `getHeightsFlow_${reqId}`,
        queueName: 'getHeightFlowsQueue',
        children: jobs.map(job => ({ queueName: 'heightsQueue', name: job.type, data: job.data, opts: job.opts }))
    });
}

// EXPRESS SETUP

const batchedPointsArr = batchLargeInputArr(
    [...Array(800_000)].map(_ => ({ lat: Math.random() * 31.45, lon: Math.random() * 31.45 }))
    ,1000
);

app.get("/getHeights", async (req: Request<undefined, { queued: boolean }, undefined>, res) => {
    const requestTimestamp = Date.now();
    
    await addFlowToHeightsQueue(
        batchedPointsArr.map((pointsArr, i) => ({
            type: "getHeights",
            data: { pointsArr, requestId: requestTimestamp.toString(), batchIndex: i }
        })),
        requestTimestamp.toString()
    );

    res.json({ queued: true });
});

    //MOCKS
    import POSITIONS_MOCK from './positions';

app.get("/getHeightsPromisePool", async (req, res) => {
    const startTime = Date.now();
    const sampleTerrainClusteredPositions = cartographicArrayClusteringForHeightRequests(terrainProvider,POSITIONS_MOCK);
    // res.json({sampleTerrainClusteredPositions: sampleTerrainClusteredPositions});

    const {results} = await PromisePool
        .for(sampleTerrainClusteredPositions)
        .withConcurrency(batchedPointsArr.length)
        .onTaskFinished((batch, pool) => {
            console.log(`Completed ${pool.processedPercentage().toFixed(2)} %`);
        })
        .useCorrespondingResults()
        .process(async (batch, index) => {
            const posHeight = await sampleTerrainMostDetailed(terrainProvider, batch);

            return posHeight;
        });

        const endTime = Date.now();

        res.json({timeToRes: `${endTime - startTime} ms`, calculated: `${results.flat().length} points`, results: results.flat()});


});


// ARENA SETUP (DASHBOARD)

import Arena from "bull-arena";

const arena = Arena(
    {
        BullMQ: Queue,
        queues: [
            {
                type: "bullmq",
                name: heightsQueue.name,
                hostId: "server",
                redis: redisOptions
            },
            {
                type: "bullmq",
                name: getHeightFlowsQueue.name,
                hostId: "server",
                redis: redisOptions
            }
        ]
    },
    { disableListen: true }
);

app.use("/arena", arena);

// BULL-BOARD SETUP (DASHGOARD)

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import cookieParser from "cookie-parser";
import PromisePool from "@supercharge/promise-pool/dist";

const serverAdapter = new ExpressAdapter();

const bullBoard = createBullBoard({
    queues: [new BullMQAdapter(heightsQueue), new BullMQAdapter(getHeightFlowsQueue)],
    serverAdapter: serverAdapter
});

serverAdapter.setBasePath("/bull-board");

app.use("/bull-board", serverAdapter.getRouter());
app.use(cookieParser());

// STARTUP

const PORT = process.env.PORT || 3010;

app.listen(PORT, () => {
    console.log(`Example app listening on port ${PORT}`);
    console.log(`Bull arena is available at: http://localhost:${PORT}/arena`);
    console.log(`Bull-board is available at: http://localhost:${PORT}/bull-board`);
});
