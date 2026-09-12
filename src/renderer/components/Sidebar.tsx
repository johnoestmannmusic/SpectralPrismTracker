import { useState } from "react";
import type { SongModel } from "@/core/songModel";
import type { ProjectFile } from "@/core/project";
import { rowDurationSec } from "@/core/timing";
import { DEFAULT_EXPLAINER, useExplainer, type ExplainerContent } from "../explainer";

export function ExplainerCard({ content }: { content: ExplainerContent }) {
  return (
    <section className="panel explainer">
      <strong className="explainer-title">{content.title}</strong>
      <div className="explainer-body">{content.body}</div>
    </section>
  );
}

function useHoverExplain(content: ExplainerContent) {
  const explain = useExplainer();
  return (event: React.MouseEvent) => explain(content);
}

export function SongComments({
  comments,
  fallback = "",
  editMode,
  onChange,
}: {
  comments: string;
  fallback?: string;
  editMode: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const display = comments.trim() ? comments : fallback;
  return (
    <section className="panel">
      <button className="collapse-header" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} SONG COMMENTS
      </button>
      {open &&
        (editMode ? (
          <textarea
            className="comments-edit"
            value={comments}
            placeholder="Song comments…"
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <p className="small">{display || "—"}</p>
        ))}
    </section>
  );
}

export interface TimingEditPatch {
  tickRate?: number;
  speed?: number;
  highlightA?: number;
  highlightB?: number;
  virtualTempo?: [number, number];
}

export function TimingCard({
  song,
  editMode,
  onEdit,
}: {
  song: SongModel;
  editMode: boolean;
  onEdit: (patch: TimingEditPatch) => void;
}) {
  const rowDuration = rowDurationSec(song.meta);
  const bpm = 60 / (Math.max(song.meta.highlightA, 1) * rowDuration);
  const [open, setOpen] = useState(false);
  const onHover = useHoverExplain({
    title: "TIMING",
    body: "Furnace stores tick rate and row speed rather than BPM. This card derives BPM from the first highlight interval, which marks the song's beat spacing.",
  });
  const meta = song.meta;

  const number = (
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (v: number) => void,
    step = 1,
  ) => (
    <div className="timing-row">
      <span className="muted small">{label}</span>
      {editMode ? (
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Math.min(Math.max(Number(e.target.value), min), max))}
        />
      ) : (
        <span className="mono small">{value}</span>
      )}
    </div>
  );

  return (
    <section className="panel" onMouseEnter={onHover}>
      <button className="collapse-header" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} TIMING · {bpm.toFixed(1)} BPM · {meta.tickRate.toFixed(1)} Hz
      </button>
      {open && (
        <div className="timing-grid">
          <div className="timing-row">
            <span className="muted small">base tempo (BPM)</span>
            {editMode ? (
              <input
                type="number"
                min={1}
                max={1000}
                step={0.01}
                value={Number(bpm.toFixed(2))}
                onChange={(e) => {
                  const nextBpm = Number(e.target.value);
                  if (!Number.isFinite(nextBpm) || nextBpm <= 0) return;
                  const speed = meta.speedPattern[0] ?? 6;
                  const tickRate = Math.min(
                    Math.max((nextBpm * Math.max(meta.highlightA, 1) * speed) / 60, 1),
                    1000,
                  );
                  onEdit({ tickRate });
                }}
              />
            ) : (
              <span className="mono small">{bpm.toFixed(2)} BPM</span>
            )}
          </div>
          {number("tick rate (Hz)", meta.tickRate, 1, 1000, (v) => onEdit({ tickRate: v }), 1)}
          {number("speed(s)", meta.speedPattern[0] ?? 6, 1, 255, (v) => onEdit({ speed: v }))}
          <div className="timing-row">
            <span className="muted small">virtual tempo</span>
            {editMode ? (
              <span className="row">
                <input
                  type="number"
                  min={1}
                  max={255}
                  value={meta.virtualTempo[0]}
                  onChange={(e) =>
                    onEdit({
                      virtualTempo: [
                        Math.min(Math.max(Number(e.target.value), 1), 255),
                        meta.virtualTempo[1],
                      ],
                    })
                  }
                />
                <span>/</span>
                <input
                  type="number"
                  min={1}
                  max={255}
                  value={meta.virtualTempo[1]}
                  onChange={(e) =>
                    onEdit({
                      virtualTempo: [
                        meta.virtualTempo[0],
                        Math.min(Math.max(Number(e.target.value), 1), 255),
                      ],
                    })
                  }
                />
              </span>
            ) : (
              <span className="mono small">
                {meta.virtualTempo[0]} / {meta.virtualTempo[1]}
              </span>
            )}
          </div>
          <div className="timing-row">
            <span className="muted small">highlights</span>
            {editMode ? (
              <span className="row">
                <input
                  type="number"
                  min={1}
                  max={255}
                  value={meta.highlightA}
                  onChange={(e) =>
                    onEdit({ highlightA: Math.min(Math.max(Number(e.target.value), 1), 255) })
                  }
                />
                <input
                  type="number"
                  min={1}
                  max={255}
                  value={meta.highlightB}
                  onChange={(e) =>
                    onEdit({ highlightB: Math.min(Math.max(Number(e.target.value), 1), 255) })
                  }
                />
              </span>
            ) : (
              <span className="mono small">
                {meta.highlightA}, {meta.highlightB}
              </span>
            )}
          </div>
          <div className="timing-row">
            <span className="muted small">patterns</span>
            <span className="mono small">
              {meta.orderLength} × {meta.patternLength} rows
            </span>
          </div>
          <div className="timing-row">
            <span className="muted small">channels</span>
            <span className="mono small">{song.channels.length}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function chipName(id: number): string {
  return id === 4 ? "Game Boy" : `Chip ${id}`;
}

export function ChipsCard({ song }: { song: SongModel }) {
  const [open, setOpen] = useState(false);
  const onHover = useHoverExplain({
    title: "CHIPS",
    body: "The sound hardware declared by the Furnace module. This port accepts Game Boy chip songs and plays their rendered stems or sampler replacements.",
  });
  if (song.chips.length === 0) return null;
  return (
    <section className="panel" onMouseEnter={onHover}>
      <button className="collapse-header" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} CHIPS · {song.chips.map((c) => chipName(c.chipId)).join(", ")}
      </button>
      {open &&
        song.chips.map((chip, i) => (
          <div key={i} className="small">
            <strong>{chipName(chip.chipId)}</strong>
            <div className="muted">
              {chip.channelCount} channels · vol {chip.volume.toFixed(2)} · pan{" "}
              {chip.panning.toFixed(2)} · front/rear {chip.frontRear.toFixed(2)}
            </div>
          </div>
        ))}
    </section>
  );
}

export function LicensesCard({ project }: { project: ProjectFile | null }) {
  if (!project) return null;
  return (
    <section className="panel">
      <h2>LICENSES</h2>
      <div className="small muted">Music License</div>
      <div className="small">{project.musicLicense || "—"}</div>
      <div className="small muted" style={{ marginTop: 6 }}>
        Code License
      </div>
      <div className="small">{project.codeLicense || "—"}</div>
      {(project.viewSourceLink || project.websiteLink) && (
        <div className="small" style={{ marginTop: 6 }}>
          {project.viewSourceLink && <div>Source: {project.viewSourceLink}</div>}
          {project.websiteLink && <div>Website: {project.websiteLink}</div>}
        </div>
      )}
    </section>
  );
}

export function SongMetaCard({
  project,
  song,
  editMode,
  onEdit,
}: {
  project: ProjectFile | null;
  song: SongModel;
  editMode: boolean;
  onEdit: (patch: Partial<ProjectFile>) => void;
}) {
  const onHover = useHoverExplain({
    title: "SONG",
    body: "Song metadata from the Project JSON. In EDIT MODE the Title, Artist and Album fields can be edited and are saved with the project.",
  });
  if (!project) return null;
  return (
    <section className="panel" onMouseEnter={onHover}>
      <h2>SONG</h2>
      {editMode ? (
        <div className="row wrap">
          <label>
            Title
            <input value={project.songTitle} onChange={(e) => onEdit({ songTitle: e.target.value })} />
          </label>
          <label>
            Artist
            <input value={project.artist} onChange={(e) => onEdit({ artist: e.target.value })} />
          </label>
          <label>
            Album
            <input value={project.album} onChange={(e) => onEdit({ album: e.target.value })} />
          </label>
        </div>
      ) : (
        <p className="mono small">
          {project.songTitle || song.meta.name}
          {project.artist ? ` — ${project.artist}` : ""}
          {project.album ? ` (${project.album})` : ""}
        </p>
      )}
      <p className="small muted">
        {song.meta.system} · {song.meta.orderLength} patterns · {song.meta.patternLength} rows
      </p>
    </section>
  );
}

export { DEFAULT_EXPLAINER };
