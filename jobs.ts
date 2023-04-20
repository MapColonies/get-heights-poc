import { Cartographic } from "cesium";

type PointsArr = {lat: number, lon: number}[];
export interface GetHeightsJob {
  type: "getHeights";
  data: { pointsArr: Cartographic[], requestId: string, batchIndex: number };
};

export type WorkerJob = GetHeightsJob;
