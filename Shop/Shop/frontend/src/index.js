// import React from "react"
// import ReactDom from "react-dom"
// import App from "./App"

// ReactDom.render(<App />, document.getElementById("root"))

//mới
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const root = document.getElementById("root");
const rootInstance = createRoot(root);
rootInstance.render(<App />);
