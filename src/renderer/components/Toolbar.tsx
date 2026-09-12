interface ToolbarProps {
  onLoadFolder: () => void;
  onSaveFur: () => void;
  onSaveMidi: () => void;
  onOpenProjectJson: () => void;
  onPackageSamples: () => void;
  onSaveWav: () => void;
  wavReady: boolean;
  status: string;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <section className="panel toolbar">
      <div className="row wrap">
        <button onClick={props.onLoadFolder}>Load Song Folder</button>
        <button onClick={props.onSaveFur}>Save .FUR</button>
        <button onClick={props.onSaveMidi}>Save .MIDI</button>
        <button onClick={props.onOpenProjectJson}>Project JSON</button>
        <button onClick={props.onPackageSamples}>Package Samples</button>
        <button onClick={props.onSaveWav} disabled={!props.wavReady}>
          Save .WAV
        </button>
        <span className="spacer" />
        <span className="mono status">{props.status}</span>
      </div>
    </section>
  );
}
