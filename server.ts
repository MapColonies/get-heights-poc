import express, { Request } from "express";
// import {setTimeout} from 'timers/promises';
import { FlowProducer, Job, JobsOptions, Queue, QueueEvents } from "bullmq";
import { GetHeightsJob } from "./jobs";
import { batchLargeInputArr, cartographicArrayClusteringForHeightRequests } from "./utils";
import {
    Cartographic,
    CesiumTerrainProvider,
    EllipsoidTerrainProvider,
    Math,
    Rectangle,
    Resource,
    TerrainProvider,
    sampleTerrain,
    sampleTerrainMostDetailed
} from "cesium";

const app = express();

const terrainProvider: TerrainProvider = new CesiumTerrainProvider({
    url: new Resource({
        url: "https://assets.ion.cesium.com/1/",
        headers: {
            authorization:
                "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0NmI3OGU0NC1mZjViLTQzYmMtYTlhMi0zOTVkZjdiYTU1N2MiLCJpZCI6MjU5LCJhc3NldHMiOnsiMSI6eyJ0eXBlIjoiVEVSUkFJTiIsImV4dGVuc2lvbnMiOlt0cnVlLHRydWUsdHJ1ZV0sInB1bGxBcGFydFRlcnJhaW4iOmZhbHNlfX0sInNyYyI6Ijc4NmQwNDM5LTdkYmMtNDNlZS1iOWZjLThmYzljZTA3M2EyZiIsImlhdCI6MTY4MjAwMjA1MywiZXhwIjoxNjgyMDA1NjUzfQ.q3KF3sIsMVts1En0bZZWwUkEiZiFFWaMX0qnuJ5ipkE"
        }
    })
});

const redisOptions = { host: "localhost", port: 5050 };

// QUEUE SETUP
const heightsQueue = new Queue("heightsQueue", { connection: redisOptions });
const getHeightFlowsQueue = new Queue("getHeightFlowsQueue", { connection: redisOptions });
const getHeightFlowsQueueEvents = new QueueEvents("getHeightFlowsQueue", { connection: redisOptions });
const getHeightsFlowProducer = new FlowProducer({ connection: redisOptions });

// UTILITIES
const addFlowToHeightsQueue = (jobs: (GetHeightsJob & { opts?: JobsOptions })[], reqId: string) => {
    return getHeightsFlowProducer.add({
        name: `getHeightsFlow_${reqId}`,
        queueName: "getHeightFlowsQueue",
        children: jobs.map(job => ({
            queueName: "heightsQueue",
            name: job.type,
            data: job.data,
            opts: job.opts
        })),
        data: {
            requestId: reqId
        }
    });
};

// EXPRESS SETUP

// const batchedPointsArr = batchLargeInputArr(
//     [...Array(800_000)].map(_ => ({ lat: Math.random() * 31.45, lon: Math.random() * 31.45 }))
//     ,1000
// );

//MOCKS
// import POSITIONS_MOCK from './positions';
// import POSITIONS_MOCK from './pos2';

function createGrid(rectangleHalfSize: number) {
    const gridWidth = 100;
    const gridHeight = 100;
    const everestLatitude = Math.toRadians(27.988257);
    const everestLongitude = Math.toRadians(86.925145);
    const e = new Rectangle(
        everestLongitude - rectangleHalfSize,
        everestLatitude - rectangleHalfSize,
        everestLongitude + rectangleHalfSize,
        everestLatitude + rectangleHalfSize
    );
    const terrainSamplePositions: Cartographic[] = [];
    for (let y = 0; y < gridHeight; ++y) {
        for (let x = 0; x < gridWidth; ++x) {
            const longitude = Math.lerp(e.west, e.east, x / (gridWidth - 1));
            const latitude = Math.lerp(e.south, e.north, y / (gridHeight - 1));
            const position = new Cartographic(longitude, latitude);
            terrainSamplePositions.push(position);
        }
    }
    return terrainSamplePositions;
}

const POSITIONS_MOCK = createGrid(0.001);

app.get("/getHeightsPromisePool", async (req, res) => {
    const startTime = Date.now();
    const sampleTerrainClusteredPositions = cartographicArrayClusteringForHeightRequests(
        terrainProvider,
        POSITIONS_MOCK
    );

    const { results } = await PromisePool.for(sampleTerrainClusteredPositions)
        .withConcurrency(sampleTerrainClusteredPositions.length)
        // .onTaskFinished((batch, pool) => {
        //     console.log(`Completed ${pool.processedPercentage().toFixed(2)} %`);
        // })
        .useCorrespondingResults()
        .process(async (batch, index) => {
            // const posHeight = await sampleTerrainMostDetailed(terrainProvider, batch);
            const posHeight = await sampleTerrain(terrainProvider, 13, batch);

            return posHeight;
        });

    const endTime = Date.now();

    res.json({
        timeToRes: `${endTime - startTime} ms`,
        batches: sampleTerrainClusteredPositions.length,
        calculated: `${results.flat().length} points`,
        results: results.flat()
    });
});

app.get("/getHeights", async (req: Request<undefined, { data: any }, undefined>, res) => {
    const requestTimestamp = Date.now();
    const sampleTerrainClusteredPositions = cartographicArrayClusteringForHeightRequests(
        terrainProvider,
        POSITIONS_MOCK
    );

   const job = await addFlowToHeightsQueue(
        sampleTerrainClusteredPositions.map((pointsArr, i) => ({
            type: "getHeights",
            data: { pointsArr, requestId: requestTimestamp.toString(), batchIndex: i },
            opts: {removeOnComplete: true}
        })),
        requestTimestamp.toString()
    );

    // Wait until flow is finished before returning
    job.job.waitUntilFinished(getHeightFlowsQueueEvents, 10_000).then((job) => {
        res.json({ data: job });
    }).catch(e => {
        res.status(408).json({data: 'Request timed out.'})
    })

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
