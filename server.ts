import express, { Request } from "express";
import { FlowProducer, Job, JobsOptions, Queue, QueueEvents } from "bullmq";
import { GetHeightsJob } from "./jobs";

const app = express();

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

app.get("/getHeights", async (req: Request<undefined, { queued: boolean }, undefined>, res) => {
    const requestTimestamp = Date.now();
    const batchedPointsArr = batchLargeInputArr(
        [...Array(15_000)].map(_ => ({ lat: Math.random() * 31.45, lon: Math.random() * 31.45 }))
        ,1000
    );

    await addFlowToHeightsQueue(
        batchedPointsArr.map((pointsArr, i) => ({
            type: "getHeights",
            data: { pointsArr, requestId: requestTimestamp.toString(), batchIndex: i }
        })),
        requestTimestamp.toString()
    );

    res.json({ queued: true });
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
import { batchLargeInputArr } from "./utils";

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
