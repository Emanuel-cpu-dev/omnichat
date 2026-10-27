import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { 
  Building2, Send, Paperclip, Video, FileText, 
  Globe, Phone, Mail, Lock, CreditCard, CheckCircle, LogOut, Users, Shield, Cpu, Monitor, Play, Square, Camera
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'https://omnichat-backend-t56k.onrender.com';
const TOKEN_KEY = 'omnichat_token';

export default function App() {
  const [view, setView] = useState('LANDING'); 
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [company, setCompany] = useState(JSON.parse(localStorage.getItem('company') || 'null'));

  // Estados de Formulario
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // Facturación
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');

  // Chat y WebSockets
  const [socket, setSocket] = useState(null);
  const [channels, setChannels] = useState([
    { id: 'general', name: 'General - Empresa' },
    { id: 'ventas', name: 'Ventas & Comercial' },
    { id: 'soporte', name: 'Soporte & Operaciones' }
  ]);
  const [currentChannel, setCurrentChannel] = useState({ id: 'general', name: 'General - Empresa' });
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [companyMembers, setCompanyMembers] = useState([]);

  // Estados para Control Remoto (AnyDesk Web)
  const [isRemoteActive, setIsRemoteActive] = useState(false);
  const [remoteId, setRemoteId] = useState('');
  const remoteVideoRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // Estados para Videollamada HD Real
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  const localVideoRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (token && user) {
      const newSocket = io(API_URL, { auth: { token } });
      setSocket(newSocket);
      
      if (company && company.access && !company.access.ok) {
        setView('BILLING');
      } else {
        setView('APP');
      }

      return () => newSocket.close();
    }
  }, [token, user]);

  // Cargar canales del servidor y miembros reales de la empresa
  useEffect(() => {
    if (!token || view !== 'APP') return;

    fetch(`${API_URL}/api/channels`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const mapped = data.map(ch => ({ id: ch.id, name: ch.name }));
          setChannels(mapped);
        }
      })
      .catch(() => {});

    const fetchMembers = () => {
      fetch(`${API_URL}/api/company/members`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setCompanyMembers(data);
          } else {
            setCompanyMembers([user]);
          }
        })
        .catch(() => {
          setCompanyMembers([user]);
        });
    };

    fetchMembers();
    const interval = setInterval(fetchMembers, 3000);
    return () => clearInterval(interval);
  }, [token, view]);

  // Sintonizar socket y mensajes al cambiar de canal
  useEffect(() => {
    if (!socket || !currentChannel || !user || view !== 'APP') return;

    socket.emit('channel:join', currentChannel.id, (res) => {
      if (res && res.error === 'SUBSCRIPTION_REQUIRED') {
        setView('BILLING');
      }
    });

    fetch(`${API_URL}/api/channels/${currentChannel.id}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (res.status === 402) {
          setView('BILLING');
          return [];
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setMessages(data);
      })
      .catch(() => {});

    socket.on('message:new', (msg) => {
      if (msg.channelId === currentChannel.id) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    return () => {
      socket.off('message:new');
    };
  }, [socket, currentChannel, user, token, view]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startRemoteSession = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      setRemoteStream(stream);
      setIsRemoteActive(true);
      setIsVideoCallActive(false);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      setRemoteId(Math.floor(100000000 + Math.random() * 900000000).toString());
    } catch (err) {
      alert('No se pudo iniciar la compartición de pantalla.');
    }
  };

  const stopRemoteSession = () => {
    if (remoteStream) remoteStream.getTracks().forEach(t => t.stop());
    setRemoteStream(null);
    setIsRemoteActive(false);
  };

  const startVideoCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setIsVideoCallActive(true);
      setIsRemoteActive(false);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    } catch (err) {
      alert('No se pudo acceder a la cámara o micrófono.');
    }
  };

  const stopVideoCall = () => {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setIsVideoCallActive(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          email: identifier.toLowerCase().trim(), 
          password, 
          companyName: inviteCode ? undefined : companyName,
          inviteCode: inviteCode ? inviteCode.trim().toUpperCase() : undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        setCompany(data.company);
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('company', JSON.stringify(data.company));
        setView('APP');
      } else {
        alert(data.error || 'Error en el registro.');
      }
    } catch (err) {
      alert('No se pudo conectar con el servidor.');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier.toLowerCase().trim(), password })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        setCompany(data.company);
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('company', JSON.stringify(data.company));
        
        if (data.company && data.company.access && !data.company.access.ok) {
          setView('BILLING');
        } else {
          setView('APP');
        }
      } else {
        alert(data.error || 'Credenciales inválidas.');
      }
    } catch (err) {
      alert('Error de autenticación con el servidor.');
    }
  };

  const handleSubscribe = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/billing/subscribe`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ holder: cardHolder, cardNumber, exp: cardExp, cvc: cardCvc })
      });
      const data = await res.json();
      if (res.ok) {
        setCompany(data.company);
        localStorage.setItem('company', JSON.stringify(data.company));
        alert('¡Suscripción activada con éxito!');
        setView('APP');
      } else {
        alert(data.error || 'Error al procesar la tarjeta.');
      }
    } catch (err) {
      alert('Error de conexión con la pasarela de pagos.');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!inputText.trim() && !selectedFile) || !currentChannel) return;

    if (selectedFile) {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (inputText.trim()) formData.append('body', inputText.trim());

      try {
        const res = await fetch(`${API_URL}/api/channels/${currentChannel.id}/files`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        if (res.status === 402) {
          setView('BILLING');
          return;
        }
        setSelectedFile(null);
        setInputText('');
      } catch (err) {
        alert('Error al subir el archivo.');
      }
      return;
    }

    if (socket && currentChannel) {
      socket.emit('message:send', { channelId: currentChannel.id, body: inputText }, (ack) => {
        if (ack && ack.error === 'SUBSCRIPTION_REQUIRED') {
          setView('BILLING');
        }
      });
    }
    setInputText('');
  };

  const logout = () => {
    localStorage.clear();
    setToken('');
    setUser(null);
    setCompany(null);
    setView('LANDING');
  };

  if (view === 'LANDING') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between">
        <header className="border-b border-slate-800 p-6 flex justify-between items-center max-w-7xl mx-auto w-full">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2.5 rounded-xl"><Globe className="w-6 h-6 text-white" /></div>
            <span className="text-xl font-bold">OmniChat <span className="text-indigo-400">Enterprise</span></span>
          </div>
          <div className="space-x-4">
            <button onClick={() => setView('LOGIN')} className="px-5 py-2.5 border border-slate-700 rounded-xl text-sm font-medium hover:bg-slate-900">Iniciar Sesión</button>
            <button onClick={() => setView('PRICING')} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold">Ver Planes</button>
          </div>
        </header>
        <main className="max-w-5xl mx-auto text-center px-6 py-24">
          <h1 className="text-6xl font-black">Todo tu equipo conectado en <span className="text-indigo-400">Tiempo Real</span>.</h1>
          <button onClick={() => setView('PRICING')} className="mt-10 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg rounded-2xl shadow-xl">Comenzar Prueba Gratis</button>
        </main>
      </div>
    );
  }

  if (view === 'PRICING') {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-8 max-w-5xl mx-auto flex flex-col justify-center">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-black">Plan Corporativo Global</h2>
          <p className="text-slate-400 mt-2">$5 USD / mes con 14 días de prueba gratis</p>
        </div>
        <div className="max-w-md mx-auto w-full bg-slate-900 border-2 border-indigo-600 p-8 rounded-3xl text-center">
          <button onClick={() => setView('REGISTER')} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 font-bold rounded-2xl">Iniciar Prueba de 14 Días</button>
        </div>
      </div>
    );
  }

  if (view === 'REGISTER') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full shadow-2xl">
          <h2 className="text-2xl font-black text-center mb-4">Crea tu Espacio Corporativo</h2>
          <form onSubmit={handleRegister} className="space-y-4">
            <input type="text" required placeholder="Tu Nombre Completo" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <input type="text" placeholder="Nombre de la Empresa" value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <input type="text" placeholder="Código de Invitación (Opcional)" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white uppercase font-mono" />
            <input type="email" required placeholder="Correo Electrónico" value={identifier} onChange={e => setIdentifier(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <input type="password" required placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-3.5 rounded-xl">Comenzar Prueba Gratis</button>
            <div className="text-center pt-2">
              <button type="button" onClick={() => setView('LOGIN')} className="text-xs text-indigo-400 hover:underline">¿Ya tienes cuenta? Inicia sesión</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'LOGIN') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full shadow-2xl">
          <h2 className="text-2xl font-black text-center mb-6">Iniciar Sesión</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="email" required placeholder="Correo Electrónico" value={identifier} onChange={e => setIdentifier(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <input type="password" required placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-3.5 rounded-xl">Acceder</button>
            <div className="text-center pt-2">
              <button type="button" onClick={() => setView('REGISTER')} className="text-xs text-indigo-400 hover:underline">¿No tienes cuenta? Regístrate</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'BILLING') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-indigo-600 p-8 rounded-3xl max-w-md w-full text-center">
          <h2 className="text-2xl font-black mb-2">Activa tu Suscripción</h2>
          <form onSubmit={handleSubscribe} className="space-y-4 text-left">
            <input type="text" required placeholder="Titular de la Tarjeta" value={cardHolder} onChange={e => setCardHolder(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <input type="text" required placeholder="Número de Tarjeta" value={cardNumber} onChange={e => setCardNumber(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-3.5 rounded-xl">Autorizar y Continuar ($5)</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      {/* Sidebar de Canales y Empresa */}
      <div className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col justify-between">
        <div>
          <div className="p-4 border-b border-slate-800 bg-slate-950/40">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-indigo-400 truncate">{company?.name || 'Mi Empresa'}</span>
              <span className="bg-indigo-500/20 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-full">PRO TRIAL</span>
            </div>

            {company?.inviteCode && (
              <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between mt-2">
                <div className="truncate pr-2">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Código Invitación</p>
                  <p className="text-xs font-mono font-bold text-indigo-300 tracking-widest">{company.inviteCode}</p>
                </div>
                <button onClick={() => { navigator.clipboard.writeText(company.inviteCode); alert('¡Código copiado!'); }} className="text-[10px] bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 px-2.5 py-1.5 rounded-lg font-bold">
                  Copiar
                </button>
              </div>
            )}
          </div>

          <div className="p-4 space-y-1">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2">Canales de la Empresa</p>
            {channels.map((ch) => (
              <button 
                key={ch.id} 
                onClick={() => setCurrentChannel(ch)} 
                className={`w-full text-left p-3 rounded-xl font-bold text-sm transition ${currentChannel?.id === ch.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                # {ch.name}
              </button>
            ))}
          </div>

          {/* LISTA DE MIEMBROS DE LA EMPRESA (Sincronizado) */}
          <div className="p-4 border-t border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2 flex items-center">
              <Users className="w-3 h-3 mr-1.5" /> Miembros de la Empresa
            </p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {companyMembers.map((m, idx) => (
                <div key={idx} className="flex items-center justify-between bg-slate-950/60 p-2 rounded-xl border border-slate-800/60 text-xs">
                  <div className="flex items-center space-x-2 truncate">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="font-semibold text-slate-200 truncate">{m.name || m.email}</span>
                  </div>
                  <span className="text-[9px] uppercase bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold">{m.role || 'member'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="truncate pr-2">
            <p className="text-xs font-bold text-slate-200 truncate">{user?.name || user?.email}</p>
            <p className="text-[10px] text-slate-500 capitalize">{user?.role || 'Miembro'}</p>
          </div>
          <button onClick={logout} className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-xl" title="Cerrar Sesión"><LogOut className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Panel Central */}
      <div className="flex-1 flex flex-col bg-slate-950">
        <div className="h-16 border-b border-slate-800 px-6 flex justify-between items-center bg-slate-900/50">
          <span className="text-lg font-bold">
            {isRemoteActive ? '🖥️ AnyDesk Remoto (' + remoteId + ')' : isVideoCallActive ? '📹 Videollamada HD en Vivo' : '#' + (currentChannel?.name || 'General')}
          </span>
          <div className="flex items-center space-x-3">
            {user?.role === 'owner' && (
              <button onClick={() => setView('BILLING')} className="bg-slate-800 hover:bg-slate-700 text-indigo-400 px-3 py-2 rounded-xl text-xs font-bold border border-slate-700">Gestionar Suscripción</button>
            )}

            {!isRemoteActive ? (
              <button onClick={startRemoteSession} className="bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded-xl text-sm font-bold flex items-center"><Monitor className="w-4 h-4 mr-2" /> Iniciar AnyDesk</button>
            ) : (
              <button onClick={stopRemoteSession} className="bg-rose-600 hover:bg-rose-500 px-4 py-2 rounded-xl text-sm font-bold flex items-center"><Square className="w-4 h-4 mr-2" /> Cerrar AnyDesk</button>
            )}

            {!isVideoCallActive ? (
              <button onClick={startVideoCall} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl text-sm font-bold flex items-center"><Video className="w-4 h-4 mr-2" /> Videollamada HD</button>
            ) : (
              <button onClick={stopVideoCall} className="bg-rose-600 hover:bg-rose-500 px-4 py-2 rounded-xl text-sm font-bold flex items-center"><Square className="w-4 h-4 mr-2" /> Colgar Videollamada</button>
            )}
          </div>
        </div>

        {/* CONTENIDO CENTRAL */}
        {isRemoteActive ? (
          <div className="flex-1 bg-black flex flex-col items-center justify-center p-4 relative">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain rounded-2xl border border-slate-800" />
          </div>
        ) : isVideoCallActive ? (
          <div className="flex-1 bg-black flex flex-col items-center justify-center p-4 relative">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover rounded-2xl border border-slate-800 shadow-2xl" />
            <div className="absolute top-6 left-6 bg-slate-900/90 border border-slate-700 px-4 py-2 rounded-xl text-xs font-bold text-emerald-400 flex items-center">
              ● Cámara Activa ({user?.name})
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((m) => (
                <div key={m.id || Math.random()} className={`flex ${m.userId === user?.id ? 'justify-end' : 'justify-start'}`}>
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl max-w-md shadow-md">
                    <div className="flex justify-between items-center mb-1 space-x-4">
                      <span className="text-xs font-bold text-indigo-400">{m.userName || 'Miembro'}</span>
                      <span className="text-[10px] text-slate-500">{new Date(m.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {m.body && <p className="text-sm leading-relaxed">{m.body}</p>}
                    {m.file && (
                      <a href={`${API_URL}/api/files/${m.file.id}/download`} target="_blank" rel="noreferrer" className="mt-3 block p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs flex items-center justify-between hover:border-indigo-500 transition">
                        <span className="truncate mr-2 font-medium">{m.file.name}</span>
                        <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center space-x-3">
              <label className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer transition border border-slate-700">
                <Paperclip className="w-5 h-5 text-slate-300" />
                <input type="file" className="hidden" onChange={e => setSelectedFile(e.target.files[0])} />
              </label>
              <input type="text" placeholder={`Enviar mensaje a #${currentChannel?.name || 'General'}...`} value={inputText} onChange={e => setInputText(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500" />
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-xl font-bold shadow-lg transition"><Send className="w-5 h-5" /></button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}