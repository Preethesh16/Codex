import React from 'react';

type AgentStatus = 'pending' | 'inprogress' | 'completed' | 'failed' | 'idle' | 'locked';

export interface OfficeDepartment {
  name: string;
  status: AgentStatus;
  unlocked: boolean;
}

export interface OfficeTask {
  id: string;
  title: string;
  department: string;
  status: 'pending' | 'inprogress' | 'completed' | 'failed';
  confidenceScore: number;
}

interface AgentOfficeFloorProps {
  companyName: string;
  stage: string;
  departments: OfficeDepartment[];
  tasks: OfficeTask[];
  messageCount: number;
  lastSignal?: string;
  onSelectDepartment: (department: string) => void;
}

type AgentMeta = {
  accent: string;
  room: string;
  action: string;
  idle: string;
  home: [number, number];
};

const AGENT_META: Record<string, AgentMeta> = {
  Research: { accent: '#4f9faf', room: 'Intel lab', action: 'Scanning the market', idle: 'Exploring new signals', home: [12, 27] },
  Finance: { accent: '#d2a63d', room: 'Runway vault', action: 'Balancing the runway', idle: 'Auditing the runway', home: [37, 27] },
  Marketing: { accent: '#d96a62', room: 'Launch studio', action: 'Building the campaign', idle: 'Mapping the launch', home: [63, 27] },
  Creative: { accent: '#9482d3', room: 'Media booth', action: 'Producing launch media', idle: 'Tuning the studio', home: [88, 27] },
  Deck: { accent: '#d99168', room: 'Pitch room', action: 'Assembling the story', idle: 'Polishing the pitch', home: [17, 76] },
  Code: { accent: '#5ca97a', room: 'Build forge', action: 'Shipping with Codex', idle: 'Inspecting the forge', home: [50, 76] },
  Conflict: { accent: '#6d87d6', room: 'Council chamber', action: 'Resolving a dispute', idle: 'Watching alignment', home: [83, 76] },
};

const ROOM_ORDER = ['Research', 'Finance', 'Marketing', 'Creative', 'Deck', 'Code', 'Conflict'];

function statusLabel(status: AgentStatus) {
  if (status === 'inprogress') return 'working';
  if (status === 'completed') return 'quest clear';
  if (status === 'failed') return 'needs help';
  return status;
}

function PixelAgent({ accent, status }: { accent: string; status: AgentStatus }) {
  return (
    <span className={`orbit-pixel-agent orbit-pixel-agent--${status}`} style={{ '--agent-accent': accent } as React.CSSProperties} aria-hidden="true">
      <span className="orbit-pixel-agent__shadow" />
      <span className="orbit-pixel-agent__legs" />
      <span className="orbit-pixel-agent__body" />
      <span className="orbit-pixel-agent__face"><i /><i /></span>
      <span className="orbit-pixel-agent__hair" />
      {status === 'completed' && <span className="orbit-pixel-agent__spark">✦</span>}
    </span>
  );
}

export function DepartmentRoom({ name, status }: { name: string; status: AgentStatus }) {
  const meta = AGENT_META[name] || AGENT_META.Research;
  return (
    <div className="orbit-department-room" style={{ '--room-accent': meta.accent } as React.CSSProperties} aria-label={`${name} agent room`}>
      <span className="orbit-department-room__sign">{meta.room} · private channel</span>
      <span className="orbit-department-room__window"><i /><i /></span>
      <span className="orbit-department-room__shelf"><i /><i /><i /></span>
      <span className="orbit-department-room__desk"><i /></span>
      <span className="orbit-department-room__agent"><PixelAgent accent={meta.accent} status={status} /><b>{name}</b><small>{statusLabel(status)}</small></span>
      <span className="orbit-department-room__chat-door">CHAT CHANNEL OPEN ↘</span>
    </div>
  );
}

export default function AgentOfficeFloor({ companyName, stage, departments, tasks, messageCount, lastSignal, onSelectDepartment }: AgentOfficeFloorProps) {
  const completed = departments.filter((department) => department.status === 'completed').length;
  const activeAgents = departments.filter((department) => department.unlocked && department.status === 'inprogress');
  const collaborating = activeAgents.length > 1;
  const xp = completed * 140 + Math.min(messageCount, 40) * 5 + activeAgents.length * 25;
  const level = Math.floor(xp / 500) + 1;
  const levelProgress = xp % 500;
  const missionProgress = Math.round((completed / Math.max(departments.length, 1)) * 100);
  const activeTask = tasks.find((task) => task.status === 'inprogress');
  const collaboratorNames = activeAgents.map((agent) => agent.name);

  return (
    <section className="orbit-office orbit-house" aria-label="Interactive Orbit multi-agent headquarters">
      <header className="orbit-office__hud">
        <div>
          <span className="orbit-office__eyebrow">ORBIT HQ · LIVE MULTI-AGENT WORLD</span>
          <h3>{companyName || 'Founder Company'} Command House</h3>
          <p>{activeTask ? `Live mission: ${activeTask.title}` : 'All specialists share one floor and patrol their stations until the next mission.'}</p>
        </div>
        <div className="orbit-office__level" aria-label={`Level ${level}, ${levelProgress} of 500 experience points`}>
          <div className="orbit-office__level-row"><strong>LVL {String(level).padStart(2, '0')}</strong><span>{levelProgress}/500 XP</span></div>
          <div className="orbit-office__xp"><span style={{ width: `${(levelProgress / 500) * 100}%` }} /></div>
        </div>
      </header>

      <div className="orbit-house__world">
        <div className="orbit-house__wallpaper" aria-hidden="true" />
        <div className="orbit-house__manager">
          <span className="orbit-office__manager-orb">◎</span>
          <span><strong>Manager Agent</strong><small>{collaborating ? `Routing a ${activeAgents.length}-agent collaboration` : activeAgents.length ? `Guiding ${activeAgents[0].name}` : 'Shared context synchronized'}</small></span>
          <b className={activeAgents.length ? 'is-live' : ''}>{activeAgents.length ? 'LIVE' : 'READY'}</b>
        </div>

        <div className="orbit-house__shared-room" aria-hidden="true">
          <span className="orbit-house__room-title">THE COMMON FLOOR · CLICK A CHARACTER TO CHAT</span>
          <span className="orbit-house__meeting-table"><i /><i /><i /></span>
          <span className="orbit-house__sofa">FOUNDER LOUNGE</span>
          <span className="orbit-house__kitchen">☕ ENERGY BAY</span>
          {ROOM_ORDER.map((name) => {
            const meta = AGENT_META[name];
            return <span key={name} className="orbit-house__station" style={{ '--station-accent': meta.accent } as React.CSSProperties}>{meta.room}</span>;
          })}
        </div>

        <div className={`orbit-house__lounge ${collaborating ? 'is-live' : ''}`} aria-hidden="true">
          <span>SYNC LOUNGE</span><i /><i /><i />
          {collaborating && <b>{collaboratorNames.join(' + ')} joint channel</b>}
        </div>
        {collaborating && <div className="orbit-house__conversation-line" aria-hidden="true"><i /><i /><i /></div>}

        {departments.map((department, index) => {
          const meta = AGENT_META[department.name] || { accent: '#a53600', room: 'Specialist room', action: 'Working', idle: 'Ready', home: [50, 50] as [number, number] };
          const status: AgentStatus = department.unlocked ? department.status : 'locked';
          const task = tasks.find((item) => item.department.toLowerCase() === department.name.toLowerCase());
          const collaborationIndex = activeAgents.findIndex((agent) => agent.name === department.name);
          const isCollaborating = collaborating && collaborationIndex >= 0;
          const spread = Math.min(activeAgents.length, 4);
          const collaborationX = 50 + (collaborationIndex - (spread - 1) / 2) * 8;
          const activity = status === 'inprogress' ? task?.title || meta.action : status === 'completed' ? 'Mission complete' : status === 'failed' ? 'Needs founder help' : status === 'locked' ? 'Complete earlier quests' : meta.idle;
          const peer = collaboratorNames.find((name) => name !== department.name);

          return (
            <button
              key={department.name}
              type="button"
              disabled={!department.unlocked}
              onClick={() => department.unlocked && onSelectDepartment(department.name)}
              className={`orbit-house-agent orbit-house-agent--${status} ${isCollaborating ? 'is-collaborating' : ''}`}
              style={{ '--agent-accent': meta.accent, '--agent-x': `${isCollaborating ? collaborationX : meta.home[0]}%`, '--agent-y': `${isCollaborating ? 50 : meta.home[1]}%`, '--agent-delay': `${index * -0.7}s` } as React.CSSProperties}
              aria-label={`${department.name} agent, ${statusLabel(status)}. Open live chat.`}
            >
              {status === 'locked' ? <span className="orbit-house-agent__lock">▣</span> : <PixelAgent accent={meta.accent} status={status} />}
              <span className="orbit-house-agent__name">{department.name}</span>
              <span className="orbit-house-agent__status">{statusLabel(status)}</span>
              {(status === 'inprogress' || isCollaborating) && <span className="orbit-house-agent__speech">{isCollaborating ? `${peer ? `Syncing with ${peer}` : 'Team sync'}…` : activity}</span>}
              <span className="orbit-house-agent__hint">click to chat</span>
            </button>
          );
        })}

        <div className="orbit-house__legend">
          <span><i className="is-roaming" /> roaming</span><span><i className="is-working" /> working</span><span><i className="is-syncing" /> collaborating</span>
        </div>
      </div>

      <footer className="orbit-office__questbar">
        <div className="orbit-office__quest-progress">
          <span className="orbit-office__quest-icon">⚑</span>
          <div><strong>Company quest · {stage || 'IDEA'}</strong><small>{completed}/{departments.length} departments cleared</small></div>
          <div className="orbit-office__mission-meter"><span style={{ width: `${missionProgress}%` }} /></div>
          <b>{missionProgress}%</b>
        </div>
        <div className="orbit-office__ticker"><span className={activeAgents.length ? 'is-live' : ''} />{lastSignal || (messageCount ? `${messageCount} agent signals logged` : 'Click any agent to open its context-aware chatbot')}</div>
      </footer>
    </section>
  );
}
