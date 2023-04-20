import { Job, Worker, WorkerOptions } from "bullmq";
import { GetHeightsJob, WorkerJob } from "./jobs";
import os from 'node:os';
import { CesiumTerrainProvider, EllipsoidTerrainProvider, Resource, TerrainProvider, sampleTerrainMostDetailed, Cartographic } from "cesium";

const workerOptions: WorkerOptions = {
  connection: {
      host: "localhost",
      port: 5050
  },
  concurrency: 10
};


// Some arbitrary number of workers.
// const workersCount = 20;

// Number of workers based on number of cpus in the system.
const workersCount = 1000;

const terrainProvider: TerrainProvider = new CesiumTerrainProvider({
    url: new Resource({
        url: "https://assets.ion.cesium.com/1/",
        headers: {
            authorization:
                "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0NmI3OGU0NC1mZjViLTQzYmMtYTlhMi0zOTVkZjdiYTU1N2MiLCJpZCI6MjU5LCJhc3NldHMiOnsiMSI6eyJ0eXBlIjoiVEVSUkFJTiIsImV4dGVuc2lvbnMiOlt0cnVlLHRydWUsdHJ1ZV0sInB1bGxBcGFydFRlcnJhaW4iOmZhbHNlfX0sInNyYyI6Ijc4NmQwNDM5LTdkYmMtNDNlZS1iOWZjLThmYzljZTA3M2EyZiIsImlhdCI6MTY4MjAwMjA1MywiZXhwIjoxNjgyMDA1NjUzfQ.q3KF3sIsMVts1En0bZZWwUkEiZiFFWaMX0qnuJ5ipkE"
        }
    })
});


for (let i = 0; i < workersCount; i++) {
    new Worker<WorkerJob["data"]>("heightsQueue", async job => {
        const jobData = job.data;
        const pointsWithHeights = await sampleTerrainMostDetailed(terrainProvider, jobData.pointsArr);

       return ({
        pointsWithHeights,
        batchIndex: jobData.batchIndex
       })

    }, workerOptions);
}

new Worker('getHeightFlowsQueue', async job => {
    const childrenValues = await job.getChildrenValues<{pointsWithHeights: Cartographic[], batchIndex: number}>();
    const sortedArray = Object.fromEntries(Object.entries(childrenValues)
    .sort((a, b) => {
        return a[1].batchIndex - b[1].batchIndex
    }))

    const total = Object.values(sortedArray).reduce<Cartographic[]>((totalPoints, batch) => ([...totalPoints, ...batch.pointsWithHeights]), []);

    return ({
        timeToRes: `${Date.now() - Number(job.data.requestId)}ms`,
        points: total.length,
        total,
    });
}, workerOptions);


console.log("Worker started!");
