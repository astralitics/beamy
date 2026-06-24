import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./app";
import { trpc, makeTrpcClient } from "./lib/trpc";
import { LocaleProvider } from "./lib/i18n";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider } from "./lib/theme/theme-context";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root element");

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: false } },
});
const trpcClient = makeTrpcClient();

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <LocaleProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </LocaleProvider>
          </QueryClientProvider>
        </trpc.Provider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
