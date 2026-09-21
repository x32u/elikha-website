import { selectPaintRecoverySource } from './paintRecovery';

describe('Easy Mode paint recovery', () => {
  test('restores every live stamp when the same session model becomes ready again', () => {
    const liveState = Array.from({ length: 2500 }, (_, index) => ({
      id: `stamp-${index}`,
      color: index % 2 ? '#3156E0' : '#E8576C',
    }));

    const recovered = selectPaintRecoverySource({
      sameSessionVersion: true,
      liveState,
      initialState: [],
    });

    expect(recovered).toHaveLength(2500);
    expect(recovered[0].id).toBe('stamp-0');
    expect(recovered[2499].id).toBe('stamp-2499');
  });

  test('uses a requested history snapshot when the session version changes', () => {
    const historyState = [{ id: 'restored-history-stamp' }];
    expect(selectPaintRecoverySource({
      sameSessionVersion: false,
      liveState: [{ id: 'newer-live-stamp' }],
      initialState: historyState,
    })).toBe(historyState);
  });
});
