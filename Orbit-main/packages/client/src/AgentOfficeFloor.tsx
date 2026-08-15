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

const AGENT_META: Record<string, { accent: string; room: string; action: string; idle: string }> = {
  Research: { accent: '#4f9faf', room: 'Intel lab', action: 'Scanning the market', idle: 'Waiting for a question' },
  Finance: { accent: '#d2a63d', room: 'Runway vault', action: 'Balancing the runway', idle: 'Watching the numbers' },
  Marketing: { accent: '#d96a62', room: 'Launch studio', action: 'Building the campaign', idle: 'Ready to launch' },
  Creative: { accent: '#9482d3', room: 'Media booth', action: 'Producing launch media', idle: 'Mic is ready' },
  Deck: { accent: '#d99168', room: 'Pitch room', action: 'Assembling the story', idle: 'Slides are standing by' },
  Code: { accent: '#5ca97a', room: 'Build forge', action: 'Shipping with Codex', idle: 'Forge is ready' },
  Conflict: { accent: '#6d87d6', room: 'Council chamber', action: 'Resolving a dispute', idle: 'Monitoring alignment' },
};

function statusLabel(status: AgentStatus) {
  if (status === 'inprogress') return 'working';
  if (status === 'completed') return 'quest clear';
  if (status === 'failed') return 'blocked';
  return status;
}

function PixelAgent({ accent, status }: { accent: string; status: AgentStatus }) {
  return (
    <div className={`orbit-pixel-agent orbit-pixel-agent--${status}`} style={{ '--agent-accent': accent } as React.CSSProperties} aria-hidden="true">
      <span className="orbit-pixel-agent__shadow" />
      <span className="orbit-pixel-agent__legs" />
      <span className="orbit-pixel-agent__body" />
      <span className="orbit-pixel-agent__face">
        <i />
        <i />
      </span>
      <span className="orbit-pixel-agent__hair" />
      {status === 'completed' && <span className="orbit-pixel-agent__spark">✦</span>}
    </div>
  );
}

export default function AgentOfficeFloor({
  companyName,
  stage,
  departments,
  tasks,
  messageCount,
  lastSignal,
  onSelectDepartment,
}: AgentOfficeFloorProps) {
  const completed = departments.filter((department) => department.status === 'completed').length;
  const working = departments.filter((department) => department.status === 'inprogress').length;
  const xp = completed * 140 + Math.min(messageCount, 40) * 5 + working * 25;
  const level = Math.floor(xp / 500) + 1;
  const levelProgress = xp % 500;
  const missionProgress = Math.round((completed / Math.max(departments.length, 1)) * 100);
  const activeTask = tasks.find((task) => task.status === 'inprogress');

  return (
    <section className="orbit-office" aria-label="Orbit agent office floor">
      <header className="orbit-office__hud">
        <div>
          <span className="orbit-office__eyebrow">ORBIT HQ · LIVE WORLD</span>
          <h3>{companyName || 'Founder Company'} Command Floor</h3>
          <p>{activeTask ? `Active quest: ${activeTask.title}` : 'The office is ready for its next founder quest.'}</p>
        </div>
        <div className="orbit-office__level" aria-label={`Level ${level}, ${levelProgress} of 500 experience points`}>
          <div className="orbit-office__level-row">
            <strong>LVL {String(level).padStart(2, '0')}</strong>
            <span>{levelProgress}/500 XP</span>
          </div>
          <div className="orbit-office__xp"><span style={{ width: `${(levelProgress / 500) * 100}%` }} /></div>
        </div>
      </header>

      <div className="orbit-office__world">
        <div className="orbit-office__manager">
          <span className="orbit-office__manager-orb">◎</span>
          <div>
            <strong>Manager Agent</strong>
            <small>{working > 0 ? `Coordinating ${working} active specialist${working === 1 ? '' : 's'}` : 'Shared context synchronized'}</small>
          </div>
          <span className={`orbit-office__manager-signal ${working > 0 ? 'is-live' : ''}`}>{working > 0 ? 'ROUTING' : 'READY'}</span>
        </div>

        <div className="orbit-office__signal-line" aria-hidden="true">
          <i /><i /><i />
        </div>

        <div className="orbit-office__grid">
          {departments.map((department, index) => {
            const meta = AGENT_META[department.name] || { accent: '#a53600', room: 'Specialist room', action: 'Working', idle: 'Ready' };
            const status: AgentStatus = department.unlocked ? department.status : 'locked';
            const departmentTask = tasks.find((task) => task.department.toLowerCase() === department.name.toLowerCase());
            const activity = status === 'inprogress'
              ? departmentTask?.title || meta.action
              : status === 'completed'
                ? 'Mission complete'
                : status === 'failed'
                  ? 'Needs founder help'
                  : status === 'locked'
                    ? 'Complete earlier quests'
                    : meta.idle;

            return (
              <button
                key={department.name}
                type="button"
                disabled={!department.unlocked}
                onClick={() => department.unlocked && onSelectDepartment(department.name)}
                className={`orbit-office-agent orbit-office-agent--${status}`}
                style={{ '--agent-accent': meta.accent, '--agent-delay': `${index * 110}ms` } as React.CSSProperties}
              >
                <span className="orbit-office-agent__room">{meta.room}</span>
                {status === 'inprogress' && <span className="orbit-office-agent__bubble">{activity}</span>}
                {status === 'locked' ? (
                  <span className="orbit-office-agent__lock" aria-hidden="true">▣</span>
                ) : (
                  <PixelAgent accent={meta.accent} status={status} />
                )}
                <span className="orbit-office-agent__desk"><i /><i /><i /></span>
                <strong>{department.name}</strong>
                <small>{activity}</small>
                <span className="orbit-office-agent__status">{statusLabel(status)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <footer className="orbit-office__questbar">
        <div className="orbit-office__quest-progress">
          <span className="orbit-office__quest-icon">⚑</span>
          <div>
            <strong>Company quest · {stage || 'IDEA'}</strong>
            <small>{completed}/{departments.length} departments cleared</small>
          </div>
          <div className="orbit-office__mission-meter"><span style={{ width: `${missionProgress}%` }} /></div>
          <b>{missionProgress}%</b>
        </div>
        <div className="orbit-office__ticker">
          <span className={working > 0 ? 'is-live' : ''} />
          {lastSignal || (messageCount ? `${messageCount} agent signals logged` : 'Awaiting the first agent signal')}
        </div>
      </footer>
    </section>
  );
}
