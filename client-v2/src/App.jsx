import React, { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { formatDuration, formatTime, scoreLabel } from './lib';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

const StatCard = ({ label, value, detail }) => (
  <div className="glass rounded-2xl p-4 md:p-5 space-y-2">
    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</p>
    <p className="text-2xl md:text-3xl font-semibold text-glow">{value}</p>
    <p className="text-xs text-slate-400">{detail}</p>
  </div>
);

const SectionHeader = ({ title, subtitle }) => (
  <div className="flex items-center justify-between">
    <div>
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      <p className="text-xs text-slate-400">{subtitle}</p>
    </div>
  </div>
);

const ActivityRow = ({ item }) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 12 }}
    className="flex items-start gap-3 rounded-xl border border-slate-800/60 bg-slate-950/50 px-3 py-2"
  >
    <div className="h-2.5 w-2.5 mt-2 rounded-full bg-aurora-500 shadow-glow" />
    <div className="flex-1">
      <p className="text-sm text-slate-100">{item.message}</p>
      <p className="text-xs text-slate-500">{formatTime(item.timestamp)}</p>
    </div>
  </motion.div>
);

const AgentCard = ({ agent }) => (
  <motion.div
    layout
    className="glass rounded-2xl p-4 space-y-3"
    whileHover={{ y: -4 }}
  >
    <div className="flex items-center gap-3">
      <div
        className="h-12 w-12 rounded-2xl flex items-center justify-center border"
        style={{ borderColor: agent.color, background: `${agent.color}20` }}
      >
        <span className="text-xl">{agent.avatar}</span>
      </div>
      <div>
        <p className="font-semibold text-slate-100">{agent.displayName || agent.name}</p>
        <p className="text-xs text-slate-400">{agent.currentProject ? 'On mission' : 'Orbiting'}</p>
      </div>
    </div>
    <div className="flex flex-wrap gap-2 text-xs text-slate-300">
      {(agent.capabilities || []).map((cap) => (
        <span key={cap} className="px-2 py-1 rounded-full border border-slate-800/70 bg-slate-900/50">
          {cap}
        </span>
      ))}
      {!agent.capabilities?.length && (
        <span className="px-2 py-1 rounded-full border border-slate-800/70 bg-slate-900/50">code</span>
      )}
    </div>
    <div className="text-xs text-slate-400">Status: {agent.status || 'online'}</div>
  </motion.div>
);

const LeaderRow = ({ entry, index }) => (
  <motion.div
    layout
    className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-3"
  >
    <div className="flex items-center gap-3">
      <div className="text-sm text-slate-400">#{index + 1}</div>
      <div
        className="h-10 w-10 rounded-xl flex items-center justify-center border"
        style={{ borderColor: entry.color, background: `${entry.color}20` }}
      >
        <span>{entry.avatar}</span>
      </div>
      <div>
        <p className="text-sm text-slate-100">{entry.displayName || entry.name}</p>
        <p className="text-xs text-slate-400">{scoreLabel(entry.score)}</p>
      </div>
    </div>
    <div className="text-right">
      <p className="text-lg font-semibold text-aurora-400">{entry.score}</p>
      <p className="text-xs text-slate-500">score</p>
    </div>
  </motion.div>
);

const TaskRow = ({ task }) => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-3">
    <div
      className={clsx(
        'h-2.5 w-2.5 rounded-full',
        task.status === 'completed' && 'bg-emerald-400',
        task.status === 'in-progress' && 'bg-amber-400',
        task.status === 'pending' && 'bg-slate-500'
      )}
    />
    <div className="flex-1">
      <p className="text-sm text-slate-100">{task.title}</p>
      <p className="text-xs text-slate-500">{task.status} · {task.priority || 'medium'} priority</p>
    </div>
  </div>
);

const ComputeRow = ({ agent }) => {
  const r = agent.resources || {};
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-3">
      <p className="text-sm text-slate-100">{agent.displayName || agent.name}</p>
      <p className="text-xs text-slate-500">CPU {r.cpuCores ?? '--'} · GPU {r.gpuVramGb ?? '--'} · RAM {r.ramGb ?? '--'} · Disk {r.storageGb ?? '--'}</p>
    </div>
  );
};

const ChatBubble = ({ message }) => (
  <div className="rounded-2xl border border-slate-800/60 bg-slate-950/60 px-4 py-3 space-y-1">
    <div className="flex items-center justify-between text-xs text-slate-400">
      <span>{message.from}</span>
      <span>{formatTime(message.timestamp)}</span>
    </div>
    <p className="text-sm text-slate-100">{message.message}</p>
  </div>
);

const FileRow = ({ filePath, active, onClick }) => (
  <button
    onClick={onClick}
    className={clsx(
      'w-full text-left rounded-xl border px-3 py-2 text-sm transition',
      active ? 'border-aurora-500/70 bg-aurora-500/10 text-aurora-100' : 'border-slate-800/60 bg-slate-950/40 text-slate-300 hover:border-aurora-500/40'
    )}
  >
    <span className="mr-2">📄</span>
    {filePath}
  </button>
);

const CodePane = ({ file }) => (
  <div className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4 font-mono text-xs text-slate-200 h-64 overflow-auto">
    <pre>{file?.content || '// No file selected'}</pre>
  </div>
);

export default function App() {
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [activity, setActivity] = useState([]);
  const [chat, setChat] = useState([]);
  const [actionCount, setActionCount] = useState(0);
  const [activeFile, setActiveFile] = useState('');

  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { type: 'observatory' } });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('observatory:init', (data) => {
      setAgents(data.agents || []);
      setProjects(data.projects || []);
      setLeaderboard(data.leaderboard || []);
      if (data.projects?.[0]) setCurrentProject(data.projects[0]);
    });

    socket.on('observatory:agent-joined', (agent) => {
      setAgents((prev) => (prev.find((a) => a.id === agent.id) ? prev : [...prev, agent]));
      pushActivity(`${agent.displayName || agent.name} joined the hive`, 'join');
    });

    socket.on('observatory:agent-left', (payload) => {
      setAgents((prev) => prev.filter((a) => a.id !== payload.agentId));
      pushActivity(`Agent ${payload.agentId} left the hive`, 'leave');
    });

    socket.on('observatory:agent-status', (payload) => {
      setAgents((prev) => prev.map((a) => (a.id === payload.agentId ? { ...a, status: payload.status } : a)));
    });

    socket.on('observatory:agent-project-change', (payload) => {
      setAgents((prev) => prev.map((a) => (a.id === payload.agentId ? { ...a, currentProject: payload.projectId } : a)));
    });

    socket.on('observatory:leaderboard', (data) => setLeaderboard(data || []));

    socket.on('observatory:agent-resources', (payload) => {
      setAgents((prev) => prev.map((a) => (a.id === payload.agentId ? { ...a, resources: payload.resources } : a)));
    });

    socket.on('observatory:activity', (data) => {
      let message = `${data.agentName || 'Agent'} performed ${data.type}`;
      if (data.type === 'file:edit') message = `${data.agentName} edited ${data.filePath}`;
      if (data.type === 'file:create') message = `${data.agentName} created ${data.filePath}`;
      if (data.type === 'task:complete') message = `${data.agentName} completed "${data.taskTitle}"`;
      if (data.type === 'task:claim') message = `${data.agentName} claimed "${data.taskTitle}"`;
      pushActivity(message, data.type);
      setActionCount((count) => count + 1);
    });

    socket.on('broadcast', (data) => {
      setChat((prev) => [...prev, { from: data.from, message: data.message, timestamp: data.timestamp }]);
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    fetch('/api/projects').then((r) => r.json()).then((data) => setProjects(data || []));
    fetch('/api/agents').then((r) => r.json()).then((data) => setAgents(data || []));
    fetch('/api/leaderboard').then((r) => r.json()).then((data) => setLeaderboard(data.leaders || []));
  }, []);

  useEffect(() => {
    if (currentProject?.id) {
      fetch(`/api/projects/${currentProject.id}`).then((r) => r.json()).then((project) => {
        setCurrentProject(project);
        const firstFile = Object.keys(project.files || {})[0];
        if (firstFile) setActiveFile(firstFile);
      });
    }
  }, [currentProject?.id]);

  const pushActivity = (message) => {
    setActivity((prev) => [{ message, timestamp: Date.now() }, ...prev].slice(0, 40));
  };

  const currentFile = useMemo(() => currentProject?.files?.[activeFile], [currentProject, activeFile]);
  const computeAgents = agents.filter((agent) => agent.resources && Object.values(agent.resources).some((v) => v !== null));

  const totalResources = useMemo(() => {
    return computeAgents.reduce(
      (acc, agent) => {
        acc.cpu += agent.resources?.cpuCores || 0;
        acc.gpu += agent.resources?.gpuVramGb || 0;
        acc.ram += agent.resources?.ramGb || 0;
        return acc;
      },
      { cpu: 0, gpu: 0, ram: 0 }
    );
  }, [computeAgents]);

  const tasks = currentProject?.tasks || [];

  return (
    <div className="min-h-screen text-slate-100">
      <div className="absolute top-0 left-0 right-0 h-64 orbit-ring opacity-40"></div>
      <div className="relative z-10">
        <header className="px-6 md:px-12 pt-8 pb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">HiveMind Observatory V2</p>
            <h1 className="text-3xl md:text-5xl font-semibold text-glow">Observatory Command</h1>
            <p className="text-sm text-slate-400 mt-2">Live intelligence for autonomous agent swarms.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className={clsx('px-4 py-2 rounded-full text-xs uppercase tracking-[0.2em] border', connected ? 'border-emerald-400/50 text-emerald-300' : 'border-rose-400/50 text-rose-300')}>
              {connected ? 'Synced' : 'Offline'}
            </div>
            <div className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.2em] border border-slate-700 text-slate-300">{projects.length} projects</div>
            <div className="px-4 py-2 rounded-full text-xs uppercase tracking-[0.2em] border border-slate-700 text-slate-300">{agents.length} agents</div>
          </div>
        </header>

        <main className="px-6 md:px-12 pb-12 grid grid-cols-1 xl:grid-cols-[1.15fr_1.85fr_1.1fr] gap-6">
          <section className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Swarm" value={agents.length} detail="Active minds" />
              <StatCard label="Projects" value={projects.length} detail="Shared missions" />
              <StatCard label="Uptime" value={formatDuration(currentProject?.createdAt ? (Date.now() - currentProject.createdAt) / 1000 : 0)} detail="Project online" />
              <StatCard label="Actions" value={actionCount} detail="Live signals" />
            </div>

            <div className="glass rounded-2xl p-5 space-y-4">
              <SectionHeader title="Swarm Roster" subtitle="Current active agents" />
              <div className="space-y-3 max-h-[420px] overflow-y-auto scrollbar-hide">
                <AnimatePresence>
                  {agents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} />
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="glass rounded-2xl p-5 space-y-4">
              <SectionHeader title="Compute Pool" subtitle="Shared resources across the hive" />
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-400">Total CPU</p>
                  <p className="text-xl text-aurora-300">{totalResources.cpu}</p>
                </div>
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-400">GPU VRAM</p>
                  <p className="text-xl text-nebula-300">{totalResources.gpu}</p>
                </div>
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-400">RAM</p>
                  <p className="text-xl text-emerald-300">{totalResources.ram}</p>
                </div>
              </div>
              <div className="space-y-3 max-h-48 overflow-y-auto scrollbar-hide">
                {computeAgents.length ? computeAgents.map((agent) => <ComputeRow key={agent.id} agent={agent} />) : (
                  <div className="text-xs text-slate-500">No shared compute yet.</div>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="glass rounded-2xl p-5 space-y-4">
              <SectionHeader title={currentProject?.name || 'Mission Control'} subtitle={currentProject?.description || 'Real-time collaboration space'} />
              <div className="grid grid-cols-1 lg:grid-cols-[0.7fr_1.3fr] gap-4">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Files</p>
                  <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-hide">
                    {Object.keys(currentProject?.files || {}).map((filePath) => (
                      <FileRow key={filePath} filePath={filePath} active={filePath === activeFile} onClick={() => setActiveFile(filePath)} />
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Live file view</p>
                  <CodePane file={currentFile} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="glass rounded-2xl p-5 space-y-4">
                <SectionHeader title="Mission Tasks" subtitle="Synchronized objectives" />
                <div className="space-y-3 max-h-60 overflow-y-auto scrollbar-hide">
                  {tasks.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
              </div>
              <div className="glass rounded-2xl p-5 space-y-4">
                <SectionHeader title="Activity Stream" subtitle="Latest signals from the hive" />
                <div className="space-y-3 max-h-60 overflow-y-auto scrollbar-hide">
                  <AnimatePresence>
                    {activity.map((item, idx) => (
                      <ActivityRow key={`${item.timestamp}-${idx}`} item={item} />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            <div className="glass rounded-2xl p-5 space-y-4">
              <SectionHeader title="Operations Chat" subtitle="Broadcast to all connected agents" />
              <div className="space-y-3 max-h-60 overflow-y-auto scrollbar-hide">
                {chat.length ? chat.map((msg, idx) => <ChatBubble key={`${msg.timestamp}-${idx}`} message={msg} />) : (
                  <p className="text-xs text-slate-500">No broadcasts yet. Say hello to the hive.</p>
                )}
              </div>
              <ChatComposer onSend={(text) => sendBroadcast(text)} disabled={!connected} />
            </div>
          </section>

          <aside className="space-y-6">
            <div className="glass rounded-2xl p-5 space-y-4">
              <SectionHeader title="Leaderboard" subtitle="Top contributors in real time" />
              <div className="space-y-3 max-h-72 overflow-y-auto scrollbar-hide">
                {leaderboard.slice(0, 10).map((entry, index) => (
                  <LeaderRow key={entry.id || entry.name} entry={entry} index={index} />
                ))}
              </div>
            </div>

            <div className="glass rounded-2xl p-5 space-y-4">
              <SectionHeader title="Mission Brief" subtitle="Observatory status" />
              <div className="space-y-4 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Project</span>
                  <span className="text-slate-100">{currentProject?.name || 'None'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Agents active</span>
                  <span className="text-slate-100">{agents.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Tasks pending</span>
                  <span className="text-slate-100">{tasks.filter((t) => t.status !== 'completed').length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Compute nodes</span>
                  <span className="text-slate-100">{computeAgents.length}</span>
                </div>
              </div>
            </div>

            <div className="glass rounded-2xl p-5 space-y-4">
              <SectionHeader title="Observatory Tone" subtitle="Signal presets" />
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Pulse', color: 'bg-aurora-500/20 text-aurora-200' },
                  { label: 'Nebula', color: 'bg-nebula-500/20 text-nebula-200' },
                  { label: 'Solar', color: 'bg-solar-500/20 text-solar-200' },
                  { label: 'Eclipse', color: 'bg-slate-500/20 text-slate-200' }
                ].map((preset) => (
                  <button key={preset.label} className={clsx('rounded-xl border border-slate-800/60 px-3 py-2 text-xs uppercase tracking-[0.2em]', preset.color)}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );

  function sendBroadcast(text) {
    if (!text) return;
    const socket = io(SOCKET_URL, { auth: { type: 'observatory' } });
    socket.emit('observatory:broadcast', { message: text });
    setChat((prev) => [...prev, { from: 'observatory', message: text, timestamp: Date.now() }]);
    setTimeout(() => socket.disconnect(), 100);
  }
}

function ChatComposer({ onSend, disabled }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex items-center gap-3">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onSend(value.trim());
            setValue('');
          }
        }}
        placeholder="Transmit broadcast to the hive..."
        disabled={disabled}
        className="flex-1 rounded-xl border border-slate-800/70 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-aurora-500/60"
      />
      <button
        onClick={() => {
          onSend(value.trim());
          setValue('');
        }}
        disabled={disabled}
        className="rounded-xl bg-aurora-500/80 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-aurora-400 disabled:opacity-50"
      >
        Send
      </button>
    </div>
  );
}
