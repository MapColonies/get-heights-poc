import axios, { AxiosResponse } from "axios";
import { WorkerJob } from "./jobs";
import { Job } from "bullmq";

// export const requestJokes = async (job: Job<RequestJokesJob>) => {
//     try {
//         const jokesRequests = Promise.all(
//             Array.from(
//                 { length: job.data.data.count },
//                 e =>
//                     new Promise((res, rej) => {
//                         const updatedProgress = Math.floor(
//                             (job.progress as number) + 1 / job.data.data.count * 100
//                         );
//                         job.updateProgress(updatedProgress);
//                         axios
//                             .get("https://api.chucknorris.io/jokes/random")
//                             .then(data => {
//                                 res(data);
//                             })
//                             .catch(e => rej(e));
//                     })
//             )
//         );
//         const jokeArr = await jokesRequests;
//         return jokeArr.map(joke => (joke as AxiosResponse).data);
//     } catch (e) {
//         console.log("ERROR", e);
//     }
// };

export const batchLargeInputArr = <T>(arr: T[], maxItemsPerBatch = 10): [T[]] => {
    const result = arr.reduce<[T[]]>(
        (resultArray, item, index) => {
            const chunkIndex = Math.floor(index / maxItemsPerBatch);

            if (!resultArray[chunkIndex]) {
                resultArray[chunkIndex] = [] as T[]; // start a new chunk
            }

            resultArray[chunkIndex].push(item);

            return resultArray;
        },
        [[]]
    );

    return result;
};
