import {
  CompositePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { FastifyInstrumentation } from "@opentelemetry/instrumentation-fastify";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { JaegerPropagator } from "@opentelemetry/propagator-jaeger";
import { Resource } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";
import { SEMRESATTRS_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { FastifyRequest } from "fastify";

if (process.env.TRACING_SERVICE_NAME != null) {
  const provider = new NodeTracerProvider({
    resource: Resource.default().merge(
      new Resource({
        [SEMRESATTRS_SERVICE_NAME]: process.env.TRACING_SERVICE_NAME,
      }),
    ),
  });

  provider.addSpanProcessor(new BatchSpanProcessor(new OTLPTraceExporter()));

  provider.register({
    propagator: new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new JaegerPropagator()],
    }),
  });

  registerInstrumentations({
    instrumentations: [
      new PinoInstrumentation(),
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => request.url === "/api/health",
      }),
      new FastifyInstrumentation({
        requestHook: (span, { request }: { request: FastifyRequest }) => {
          for (const [key, value = ""] of Object.entries(request.headers)) {
            if (key.toLowerCase() !== "x-api-key") {
              span.setAttribute(`http.header.${key}`, value);
            }
          }
        },
      }),
    ],
  });
}
