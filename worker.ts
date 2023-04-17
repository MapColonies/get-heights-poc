import { Job, Worker, WorkerOptions } from "bullmq";
import { GetHeightsJob, WorkerJob } from "./jobs";

const workerOptions: WorkerOptions = {
  connection: {
      host: "localhost",
      port: 5050
  },
  concurrency: 5000
};

const workerHandler = async (job: Job<WorkerJob>) => {
    switch (job.data.type) {
        case "getHeights":
          const res = await new Promise((res, rej) => {
            setTimeout(() => {
                res((job as Job<GetHeightsJob>).data.data.pointsArr.map(point => {
                    return {...point, height: Math.random() * 120}
                }))
            }, 5000);
          });

          return res
    }
};



new Worker("jokesQueue", workerHandler, workerOptions);

const workersCount = 20;
for (let i = 0; i < workersCount; i++) {
    new Worker<WorkerJob>("heightsQueue", workerHandler, workerOptions);
}


console.log("Worker started!");
