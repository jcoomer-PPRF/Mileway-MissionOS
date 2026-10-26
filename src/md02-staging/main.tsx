import ReactDOM from "react-dom/client";
import { PersistentPilot } from "@/features/mission-delivery/persistent/PersistentPilot";
import "../index.css";
if (import.meta.env.MODE !== "md02-staging") throw new Error("Isolated staging build required");
ReactDOM.createRoot(document.getElementById("root")!).render(<PersistentPilot hostedStaging />);
