import { FastifyOtelInstrumentation } from "@fastify/otel";
import {
  CompositePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { JaegerPropagator } from "@opentelemetry/propagator-jaeger";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

export let fastifyOtelInstrumentation: FastifyOtelInstrumentation | undefined;

if (process.env.TRACING_SERVICE_NAME != null) {
  fastifyOtelInstrumentation = new FastifyOtelInstrumentation({
    ignorePaths: ({ url }) => url === "/api/health" || url === "/api/metrics",
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
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: process.env.TRACING_SERVICE_NAME,
      }),
    ),
  });

  provider.register({
    propagator: new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new JaegerPropagator()],
    }),
  });

  fastifyOtelInstrumentation.setTracerProvider(provider);

  registerInstrumentations({
    instrumentations: [
      new PinoInstrumentation(),
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) =>
          request.url === "/api/health" || request.url === "/api/metrics",
      }),
    ],
  });
}
