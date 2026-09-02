import { FastifyOtelInstrumentation } from "@fastify/otel";
import { metrics } from "@opentelemetry/api";
import {
  CompositePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import fs from "node:fs";
import path from "node:path";

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8"),
) as { name: string; version: string };

export let fastifyOtelInstrumentation: FastifyOtelInstrumentation | undefined;

if (process.env.OTEL_SERVICE_NAME != null) {
  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME,
    }),
  );

  const METRICS_PORT = Number(
    process.env.OTEL_EXPORTER_PROMETHEUS_PORT ?? 9464,
  );
  const prometheusExporter = new PrometheusExporter(
    { port: METRICS_PORT },
    () => {
      console.log(`Prometheus metrics server started on port ${METRICS_PORT}`);
    },
  );

  const meterProvider = new MeterProvider({
    resource,
    readers: [prometheusExporter],
  });

  metrics.setGlobalMeterProvider(meterProvider);

  metrics
    .getMeter("url-shortener")
    .createGauge("swan_app_build_info", { description: "Build information" })
    .record(1, { version: packageJson.version });

  fastifyOtelInstrumentation = new FastifyOtelInstrumentation({
    ignorePaths: ({ url }) => url === "/api/health",
    requestHook: (span, request) => {
      for (const [key, value = ""] of Object.entries(request.headers)) {
        if (key.toLowerCase() !== "x-api-key") {
          span.setAttribute(`http.header.${key}`, value);
        }
      }
    },
  });

  const provider = new NodeTracerProvider({
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
    resource,
  });

  provider.register({
    propagator: new CompositePropagator({
      propagators: [new W3CTraceContextPropagator()],
    }),
  });

  fastifyOtelInstrumentation.setTracerProvider(provider);
  fastifyOtelInstrumentation.setMeterProvider(meterProvider);

  registerInstrumentations({
    meterProvider,
    instrumentations: [
      new PinoInstrumentation(),
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => request.url === "/api/health",
      }),
    ],
  });
}
