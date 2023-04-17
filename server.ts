import express, { Request } from "express";
import { Queue, QueueScheduler } from "bullmq";
import { GetHeightsJob } from "./jobs";

const app = express();

const redisOptions = { host: "localhost", port: 5050 };

// QUEUE SETUP
const heightsQueue = new Queue("heightsQueue", { connection: redisOptions });

const queues = {
    heightsQueue
};



const schedulers = {
    heightsQueue: new QueueScheduler(heightsQueue.name, {
      connection: redisOptions
    })
};

// UTILITIES

const addJobToHeightsQueue = (job: GetHeightsJob) => heightsQueue.add(job.type, job);

// EXPRESS SETUP

app.get("/getHeights", async (req: Request<undefined, {queued: boolean}, undefined>, res) => {
  await addJobToHeightsQueue({
      type: "getHeights",
      data: { pointsArr: [...Array(813)].map(_=> ({lat: Math.ceil(Math.random()*31450), lon: Math.ceil(Math.random()*31450)})) }
  });

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

const serverAdapter = new ExpressAdapter();

const bullBoard = createBullBoard({
    queues: [new BullMQAdapter(queues.heightsQueue)],
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
