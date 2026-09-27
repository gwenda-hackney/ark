import { mount } from "svelte";
import "../ui/theme/index.css";
import App from "./App.svelte";
import { installClientErrorHandlers } from "./client-error";

installClientErrorHandlers();

mount(App, { target: document.getElementById("app")! });
