type PointsArr = {lat: number, lon: number}[];
export interface GetHeightsJob {
  type: "getHeights";
  data: { pointsArr: PointsArr, requestId: string, batchIndex: number };
};

export type WorkerJob = GetHeightsJob;
