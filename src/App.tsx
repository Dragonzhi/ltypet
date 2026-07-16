import { lazy, Suspense } from "react";
import TianyiPet from "./components/TianyiPet";
import "./App.css";

const DebugConsole = import.meta.env.DEV
  ? lazy(() => import("./components/DebugConsole"))
  : null;

function App() {
  return (
    <TianyiPet>
      {import.meta.env.DEV && DebugConsole ? (
        <Suspense fallback={null}>
          <DebugConsole />
        </Suspense>
      ) : null}
    </TianyiPet>
  );
}

export default App;
