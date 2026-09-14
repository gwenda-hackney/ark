import { mount } from "svelte";
import "./theme/index.css";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
