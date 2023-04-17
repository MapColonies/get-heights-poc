type PointsArr = {lat: number, lon: number}[];
export interface GetHeightsJob {
  type: "getHeights";
  data: { pointsArr: PointsArr };
};

export type WorkerJob = GetHeightsJob;
