import { memo } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

export const SpendSparkline = memo(function SpendSparkline({
  data,
}: {
  data: Array<{ day: string; spendMinor: number }>;
}) {
  if (data.length < 2) return null;
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%" debounce={150}>
        <LineChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <YAxis hide domain={[0, "dataMax"]} />
          <Line
            type="monotone"
            dataKey="spendMinor"
            stroke="var(--primary)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
