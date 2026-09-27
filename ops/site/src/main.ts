import { mount } from "svelte";
import "./theme/index.css";
import App from "./App.svelte";
import { installClientErrorHandlers } from "./lib/client-error";

installClientErrorHandlers();

mount(App, { target: document.getElementById("app")! });
