import "./style.css";
import { EarthApp } from "./core/app";

const canvas = document.querySelector("canvas")!;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const app = new EarthApp(canvas);
app.load("/data/wind.json").then(() => app.start());
