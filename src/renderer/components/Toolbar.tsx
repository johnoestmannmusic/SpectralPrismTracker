import { useExplainer } from "../explainer";
import { downloadWavExplain, projectJsonExplain } from "../explainerContent";

interface ToolbarProps {
  onLoadFolder: () => void;
  onNewProject: () => void;
  onSaveFur: () => void;
  onSaveMidi: () => void;
  onOpenProjectJson: () => void;
  onPackageSamples: () => void;
  onSaveWav: () => void;
  wavReady: boolean;
  status: string;
}

export function Toolbar(props: ToolbarProps) {
  const explain = useExplainer();
  return (
    <section className="panel toolbar">
      <div className="row wrap">
        <button onClick={props.onLoadFolder}>Load Song Folder</button>
        <button onClick={props.onNewProject} title="Clear patterns, reset to one default instrument">
          New Project
        </button>
        <button onClick={props.onSaveFur}>Save .FUR</button>
        <button onClick={props.onSaveMidi}>Save .MIDI</button>
        <button onClick={props.onOpenProjectJson} onMouseEnter={() => explain(projectJsonExplain())}>Project JSON</button>
        <button onClick={props.onPackageSamples}>Package Samples</button>
        <button
          onClick={props.onSaveWav}
          onMouseEnter={() => explain(downloadWavExplain())}
          disabled={!props.wavReady}
        >
          Save .WAV
        </button>
        <span className="spacer" />
        <span className="mono status">{props.status}</span>
      </div>
    </section>
  );
}
