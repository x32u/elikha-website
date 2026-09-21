export const DEFAULT_ACTIVITY_MAX_POINTS = 5;
export const MAX_ACTIVITY_POINTS = 1000;

export const normalizeActivityMaxPoints = (value) => {
  const points = Number(value);
  if (!Number.isInteger(points) || points < 1 || points > MAX_ACTIVITY_POINTS) return null;
  return points;
};
