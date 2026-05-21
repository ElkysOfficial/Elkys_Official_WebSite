import type { ComponentProps } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart, RadarChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

// Registro modular do ECharts: apenas os tipos de gráfico usados na zona
// Core, para não puxar a engine inteira. Mesma engine usada no Sonnar (lá
// via vue-echarts).
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

type CoreChartOption = ComponentProps<typeof ReactEChartsCore>["option"];

interface CoreChartProps {
  option: CoreChartOption;
  height?: number;
  className?: string;
}

/** Wrapper fino do ECharts para a zona Core. Centraliza o registro de módulos. */
export default function CoreChart({ option, height = 300, className }: CoreChartProps) {
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      lazyUpdate
      className={className}
      style={{ height, width: "100%" }}
    />
  );
}
