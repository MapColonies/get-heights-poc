import axios, { AxiosResponse } from "axios";
import { WorkerJob } from "./jobs";
import { Job } from "bullmq";
import { Cartographic, TerrainProvider } from "cesium";

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

export const cartographicArrayClusteringForHeightRequests = (
    terrainProvider: TerrainProvider,
    positions: Cartographic[],
    maxRequestsPerBatch = 1
) => {
    const positionsClustersByTile = new Map<string, Cartographic[]>();

    positions.forEach(pos => {
        // Get max level for position.
        const maxLevelAtPos = terrainProvider.availability.computeMaximumLevelAtPosition(pos);

        // Get correspond tile.
        const posTile = terrainProvider.tilingScheme.positionToTileXY(pos, maxLevelAtPos);

        // Create unique key per tile matched.
        const positionTilePath = `${maxLevelAtPos}_${posTile?.x}_${posTile?.y}`;

        // Add position to pos array in dictionary
        const currentPosInTile = positionsClustersByTile.get(positionTilePath) ?? [];

        positionsClustersByTile.set(positionTilePath, [...currentPosInTile, pos]);
    });

    // Create batches from clustered positions by max requests per batch.

    const clusteredArray = Array.from(positionsClustersByTile).map(([_, val]) => val);
    
    // Concat arrays up to maxRequestsPerBatch per batch

    const newOptimizedCluster: Cartographic[][] = [];

    for(let i=0; i < clusteredArray.length; i += maxRequestsPerBatch) {
        const sliceCount = Math.min(clusteredArray.length, i + maxRequestsPerBatch);
        const newBatch: Cartographic[] = clusteredArray.slice(i, sliceCount).flat();
        newOptimizedCluster.push(newBatch);
    }


    return newOptimizedCluster;

};
