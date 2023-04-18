import { Job, Worker, WorkerOptions } from "bullmq";
import {setTimeout} from 'timers/promises';
import { GetHeightsJob, WorkerJob } from "./jobs";
import os from 'node:os';

const workerOptions: WorkerOptions = {
  connection: {
      host: "localhost",
      port: 5050
  },
  concurrency: 100
};


// Some arbitrary number of workers.
const workersCount = 20;

// Number of workers based on number of cpus in the system.
// const workersCount = os.cpus().length;

for (let i = 0; i < workersCount; i++) {
    new Worker<WorkerJob["data"]>("heightsQueue", async job => {
        const jobData = job.data;
        await setTimeout(3000);

       const pointsWithHeights = jobData.pointsArr.map(point => {
           return { ...point, height: Math.random() * 120 };
       });

       return ({
        pointsWithHeights,
        batchIndex: jobData.batchIndex
       })

    }, workerOptions);
}

new Worker('getHeightFlowsQueue', async job => {
    const childrenValues = await job.getChildrenValues<{pointsWithHeights: {lat: number, lon: number, height: number}, batchIndex: number}>();
    const sortedArray = Object.fromEntries(Object.entries(childrenValues)
    .sort((a, b) => {
        return a[1].batchIndex - b[1].batchIndex
    }))

    return Object.values(sortedArray).map(val => val.pointsWithHeights);
}, workerOptions);


console.log("Worker started!");
