// A model can become ready again after a renderer interruption or an internal
// loader retry. In that case the live session is authoritative; using the
// original activity payload would erase everything painted since launch.
export const selectPaintRecoverySource = ({
  sameSessionVersion,
  liveState,
  initialState,
}) => (sameSessionVersion ? liveState : initialState);
