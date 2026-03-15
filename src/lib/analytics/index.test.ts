import {
  calculateCashflowNeutralDrawdown,
  calculateCashflowNeutralDrawdownSeries
} from './index';

describe('calculateCashflowNeutralDrawdownSeries', () => {
  it('keeps drawdown unchanged after a deposit event', () => {
    const deals = [
      {
        deal_id: '1',
        time: '2026-03-10T00:00:00.000Z',
        type: 'Balance',
        profit: 100000,
        commission: 0,
        swap: 0,
        balance_after: 100000
      },
      {
        deal_id: '2',
        time: '2026-03-11T00:00:00.000Z',
        type: 'buy',
        profit: -10000,
        commission: 0,
        swap: 0,
        balance_after: 90000
      },
      {
        deal_id: '3',
        time: '2026-03-12T00:00:00.000Z',
        type: 'Balance',
        profit: 50000,
        commission: 0,
        swap: 0,
        balance_after: 140000
      }
    ];

    const series = calculateCashflowNeutralDrawdownSeries(deals, []);

    expect(series).toHaveLength(3);
    expect(series[1].drawdownPercent).toBeCloseTo(10, 4);
    expect(series[2].drawdownPercent).toBeCloseTo(10, 4);
    expect(calculateCashflowNeutralDrawdown(deals, [])).toBeCloseTo(10, 4);
  });

  it('does not count pure withdrawal as drawdown', () => {
    const deals = [
      {
        deal_id: '1',
        time: '2026-03-10T00:00:00.000Z',
        type: 'Balance',
        profit: 100000,
        commission: 0,
        swap: 0,
        balance_after: 100000
      },
      {
        deal_id: '2',
        time: '2026-03-11T00:00:00.000Z',
        type: 'buy',
        profit: 20000,
        commission: 0,
        swap: 0,
        balance_after: 120000
      },
      {
        deal_id: '3',
        time: '2026-03-12T00:00:00.000Z',
        type: 'Balance',
        profit: -40000,
        commission: 0,
        swap: 0,
        balance_after: 80000
      },
      {
        deal_id: '4',
        time: '2026-03-13T00:00:00.000Z',
        type: 'sell',
        profit: -10000,
        commission: 0,
        swap: 0,
        balance_after: 70000
      }
    ];

    const series = calculateCashflowNeutralDrawdownSeries(deals, []);

    expect(series).toHaveLength(4);
    expect(series[2].drawdownPercent).toBeCloseTo(0, 4);
    expect(series[3].drawdownPercent).toBeCloseTo(12.5, 4);
    expect(calculateCashflowNeutralDrawdown(deals, [])).toBeCloseTo(12.5, 4);
  });
});

