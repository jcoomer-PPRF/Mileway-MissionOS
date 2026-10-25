import ReactDOM from "react-dom/client";
import { PersistentPilot } from "@/features/mission-delivery/persistent/PersistentPilot";
import "../index.css";
if (import.meta.env.MODE !== "md02")
  throw new Error("Local MD02 build required");
ReactDOM.createRoot(document.getElementById("root")!).render(
  <PersistentPilot />,
);
