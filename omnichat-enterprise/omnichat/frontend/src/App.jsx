import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { 
  Building2, Send, Paperclip, Video, FileText, 
  Globe, Phone, Mail, Lock, CreditCard, CheckCircle, LogOut, Users, Shield, Cpu, Monitor, Play, Square, Camera, PhoneCall, Bell, MessageSquare, Menu, X, Check, CheckCheck
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

  // Chat, Canales y MP
  const [socket, setSocket] = useState(null);
  const [channels, setChannels] = useState([
    { id: 'general', name: 'General - Empresa' },
    { id: 'ventas', name: 'Ventas & Comercial' },
    { id: 'soporte', name: 'Soporte & Operaciones' }
  ]);
  const [currentChannel, setCurrentChannel] = useState({ id: 'general', name: 'General - Empresa', type: 'channel' });
  const [messages, setMessages] = useState([]);
  const [dmMessages, setDmMessages] = useState({});
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [companyMembers, setCompanyMembers] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Llamadas y WebRTC
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCallUser, setActiveCallUser] = useState(null);
  const [isRemoteActive, setIsRemoteActive] = useState(false);
  const [remoteId, setRemoteId] = useState('');
  const remoteVideoRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  const localVideoRef = useRef(null);
  const remoteCallVideoRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const peerConnectionRef = useRef(null);

  const messagesEndRef = useRef(null);

  // Inicializar Socket y Eventos en Tiempo Real
  useEffect(() => {
    if (token && user) {
      const newSocket = io(API_URL, { auth: { token } });
      setSocket(newSocket);
      
      if (company && company.access && !company.access.ok) {
        setView('BILLING');
      } else {
        setView('APP');
      }

      newSocket.on('dm:new', (msg) => {
        setDmMessages(prev => {
          const list = prev[msg.senderId] || [];
          return { ...prev, [msg.senderId]: [...list, msg] };
        });

        if (currentChannel.type === 'dm' && currentChannel.id === msg.senderId) {
          newSocket.emit('dm:read', { messageId: msg.id, senderId: msg.senderId });
        }
      });

      newSocket.on('dm:marked-read', ({ messageId }) => {
        setDmMessages(prev => {
          const updated = { ...prev };
          for (const partnerId in updated) {
            updated[partnerId] = updated[partnerId].map(m => m.id === messageId ? { ...m, read: true } : m);
          }
          return updated;
        });
      });

      newSocket.on('call:ringing', ({ fromUserId, fromUserName }) => {
        setIncomingCall({ fromUserId, fromUserName });
      });

      newSocket.on('call:accepted', async ({ fromUserId }) => {
        setIsVideoCallActive(true);
        await startWebRTC(false);
      });

      newSocket.on('call:signal', async ({ from, data }) => {
        if (peerConnectionRef.current) {
          if (data.sdp) {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
            if (data.sdp.type === 'offer') {
              const answer = await peerConnectionRef.current.createAnswer();
              await peerConnectionRef.current.setLocalDescription(answer);
              newSocket.emit('call:signal', { to: from, data: { sdp: peerConnectionRef.current.localDescription } });
            }
          } else if (data.candidate) {
            try {
              await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) { console.error(e); }
          }
        }
      });

      return () => newSocket.close();
    }
  }, [token, user]);

  // Cargar canales y miembros
  useEffect(() => {
    if (!token || view !== 'APP') return;

    fetch(`${API_URL}/api/channels`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setChannels(data.map(ch => ({ id: ch.id, name: ch.name })));
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
          } else if (user) {
            setCompanyMembers([user]);
          }
        })
        .catch(() => { if (user) setCompanyMembers([user]); });
    };

    fetchMembers();
    const interval = setInterval(fetchMembers, 3000);
    return () => clearInterval(interval);
  }, [token, view, user]);

  // Manejar cambio de canal público
  useEffect(() => {
    if (!socket || !currentChannel || currentChannel.type === 'dm' || view !== 'APP') return;

    socket.emit('channel:join', currentChannel.id, (res) => {
      if (res && res.error === 'SUBSCRIPTION_REQUIRED') setView('BILLING');
    });

    fetch(`${API_URL}/api/channels/${currentChannel.id}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (res.status === 402) { setView('BILLING'); return []; }
        return res.json();
      })
      .then((data) => { if (Array.isArray(data)) setMessages(data); })
      .catch(() => {});

    socket.on('message:new', (msg) => {
      if (msg.channelId === currentChannel.id) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    return () => { socket.off('message:new'); };
  }, [socket, currentChannel, token, view]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, dmMessages]);

  const openDirectMessage = (member) => {
    if (!user || member.id === user.id) return;
    setCurrentChannel({
      id: member.id,
      name: member.name || member.email,
      type: 'dm'
    });
    setMobileMenuOpen(false);
  };

  const startWebRTC = async (isCaller) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (remoteCallVideoRef.current) {
          remoteCallVideoRef.current.srcObject = event.streams[0];
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socket && activeCallUser) {
          socket.emit('call:signal', { to: activeCallUser.id, data: { candidate: event.candidate } });
        }
      };

      if (isCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call:signal', { to: activeCallUser.id, data: { sdp: pc.localDescription } });
      }
    } catch (err) {
      alert('No se pudo acceder a la cámara o micrófono.');
    }
  };

  const callMember = (member) => {
    if (!user || member.id === user.id) return alert('No puedes llamarte a ti mismo.');
    setActiveCallUser(member);
    socket.emit('call:start', { targetUserId: member.id });
    alert(`Llamando a ${member.name}...`);
  };

  const acceptIncomingCall = () => {
    socket.emit('call:accept', { targetUserId: incomingCall.fromUserId });
    setActiveCallUser({ id: incomingCall.fromUserId, name: incomingCall.fromUserName });
    setIncomingCall(null);
    setIsVideoCallActive(true);
    startWebRTC(true);
  };

  const rejectIncomingCall = () => { setIncomingCall(null); };

  const hangUpCall = () => {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    setLocalStream(null);
    setIsVideoCallActive(false);
    setActiveCallUser(null);
  };

  const startRemoteSession = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      setRemoteStream(stream);
      setIsRemoteActive(true);
      setIsVideoCallActive(false);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      setRemoteId(Math.floor(100000000 + Math.random() * 900000000).toString());
    } catch (err) { alert('No se pudo compartir pantalla.'); }
  };

  const stopRemoteSession = () => {
    if (remoteStream) remoteStream.getTracks().forEach(t => t.stop());
    setRemoteStream(null);
    setIsRemoteActive(false);
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
        setToken(data.token); setUser(data.user); setCompany(data.company);
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('company', JSON.stringify(data.company));
        setView('APP');
      } else { alert(data.error || 'Error en el registro.'); }
    } catch (err) { alert('No se pudo conectar con el servidor.'); }
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
        setToken(data.token); setUser(data.user); setCompany(data.company);
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('company', JSON.stringify(data.company));
        setView(data.company?.access?.ok ? 'APP' : 'BILLING');
      } else { alert(data.error || 'Credenciales inválidas.'); }
    } catch (err) { alert('Error de autenticación.'); }
  };

  const handleSubscribe = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/billing/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ holder: cardHolder, cardNumber, exp: cardExp, cvc: cardCvc })
      });
      const data = await res.json();
      if (res.ok) {
        setCompany(data.company);
        localStorage.setItem('company', JSON.stringify(data.company));
        alert('¡Suscripción activada!'); setView('APP');
      } else { alert(data.error || 'Error al procesar la tarjeta.'); }
    } catch (err) { alert('Error de conexión.'); }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!inputText.trim() && !selectedFile) || !currentChannel) return;

    if (currentChannel.type === 'dm') {
      socket.emit('dm:send', { recipientId: currentChannel.id, body: inputText }, (res) => {
        if (res && res.ok) {
          setDmMessages(prev => {
            const list = prev[currentChannel.id] || [];
            return { ...prev, [currentChannel.id]: [...list, res.msg] };
          });
        }
      });
      setInputText('');
      return;
    }

    if (selectedFile) {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (inputText.trim()) formData.append('body', inputText.trim());
      try {
        await fetch(`${API_URL}/api/channels/${currentChannel.id}/files`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
        });
        setSelectedFile(null); setInputText('');
      } catch (err) { alert('Error al subir archivo.'); }
      return;
    }

    if (socket && currentChannel) {
      socket.emit('message:send', { channelId: currentChannel.id, body: inputText });
    }
    setInputText('');
  };

  const logout = () => { localStorage.clear(); setToken(''); setUser(null); setCompany(null); setView('LANDING'); };

  // RENDERIZADO SEGURO DE VISTAS EXTERNAS (Evita pantalla en blanco)
  if (view === 'LANDING') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between">
        <header className="border-b border-slate-800 p-6 flex justify-between items-center max-w-7xl mx-auto w-full">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2.5 rounded-xl"><Globe className="w-6 h-6 text-white" /></div>
            <span className="text-xl font-bold">OmniChat <span className="text-indigo-400">Enterprise</span></span>
          </div>
          <div className="space-x-4">
            <button onClick={() => setView('LOGIN')} className="px-5 py-2.5 border border-slate-700 rounded-xl text-sm font-medium hover:bg-slate-900 cursor-pointer">Iniciar Sesión</button>
            <button onClick={() => setView('REGISTER')} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold cursor-pointer">Comenzar Gratis</button>
          </div>
        </header>
        <main className="max-w-5xl mx-auto text-center px-6 py-24">
          <h1 className="text-5xl md:text-6xl font-black">Discord, AnyDesk, Teams y Meet en <span className="text-indigo-400">Una Sola App</span>.</h1>
          <button onClick={() => setView('REGISTER')} className="mt-10 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg rounded-2xl shadow-xl cursor-pointer">Crear Espacio Corporativo</button>
        </main>
      </div>
    );
  }

  if (view === 'REGISTER') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full shadow-2xl text-white">
          <h2 className="text-2xl font-black text-center mb-4">Crea tu Espacio Corporativo</h2>
          <form onSubmit={handleRegister} className="space-y-4">
            <input type="text" required placeholder="Tu Nombre Completo" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <input type="text" placeholder="Nombre de la Empresa" value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <input type="text" placeholder="Código de Invitación (Opcional)" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white uppercase font-mono" />
            <input type="email" required placeholder="Correo Electrónico" value={identifier} onChange={e => setIdentifier(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <input type="password" required placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-3.5 rounded-xl cursor-pointer">Registrarse</button>
            <button type="button" onClick={() => setView('LANDING')} className="w-full text-center text-xs text-slate-400 hover:text-white pt-2">Volver al inicio</button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'LOGIN') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full shadow-2xl text-white">
          <h2 className="text-2xl font-black text-center mb-6">Iniciar Sesión</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="email" required placeholder="Correo Electrónico" value={identifier} onChange={e => setIdentifier(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <input type="password" required placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-3.5 rounded-xl cursor-pointer">Acceder</button>
            <button type="button" onClick={() => setView('LANDING')} className="w-full text-center text-xs text-slate-400 hover:text-white pt-2">Volver al inicio</button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'BILLING') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-indigo-600 p-8 rounded-3xl max-w-md w-full text-center text-white">
          <h2 className="text-2xl font-black mb-2">Activa tu Suscripción ($5/mes)</h2>
          <form onSubmit={handleSubscribe} className="space-y-4 text-left mt-4">
            <input type="text" required placeholder="Titular de la Tarjeta" value={cardHolder} onChange={e => setCardHolder(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <input type="text" required placeholder="Número de Tarjeta" value={cardNumber} onChange={e => setCardNumber(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-3.5 rounded-xl cursor-pointer">Pagar y Entrar</button>
          </form>
        </div>
      </div>
    );
  }

  const currentDmList = currentChannel.type === 'dm' ? (dmMessages[currentChannel.id] || []) : [];

  return (
    <div className="flex h-dvh w-screen bg-slate-950 text-white overflow-hidden relative">
      
      {/* NOTIFICACIÓN DE LLAMADA ENTRANTE */}
      {incomingCall && (
        <div className="absolute top-4 right-4 z-50 bg-indigo-950 border-2 border-indigo-500 p-5 rounded-2xl shadow-2xl flex items-center space-x-4 animate-bounce">
          <Bell className="w-8 h-8 text-indigo-400 animate-pulse" />
          <div>
            <p className="text-xs text-indigo-300 font-bold uppercase">Llamada Entrante</p>
            <p className="text-sm font-bold text-white">{incomingCall.fromUserName} te está llamando...</p>
          </div>
          <div className="flex space-x-2">
            <button onClick={acceptIncomingCall} className="bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer">Atender</button>
            <button onClick={rejectIncomingCall} className="bg-rose-600 hover:bg-rose-500 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer">Rechazar</button>
          </div>
        </div>
      )}

      {/* BOTÓN MÓVIL */}
      <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden absolute top-3 left-3 z-40 bg-indigo-600 p-2.5 rounded-xl text-white shadow-lg cursor-pointer">
        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* SIDEBAR RESPONSIVO */}
      <div className={`fixed md:relative z-30 inset-y-0 left-0 w-72 md:w-80 bg-slate-900 border-r border-slate-800 flex flex-col justify-between transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div>
          <div className="p-4 border-b border-slate-800 bg-slate-950/40">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-indigo-400 truncate">{company?.name || 'Mi Empresa'}</span>
              <span className="bg-indigo-500/20 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-full">PRO</span>
            </div>
            {company?.inviteCode && (
              <div className="bg-slate-950 border border-slate-800 p-2 rounded-xl flex items-center justify-between mt-2">
                <span className="text-xs font-mono font-bold text-indigo-300">{company.inviteCode}</span>
                <button onClick={() => { navigator.clipboard.writeText(company.inviteCode); alert('¡Código copiado!'); }} className="text-[10px] bg-indigo-600/30 text-indigo-300 px-2 py-1 rounded font-bold cursor-pointer">Copiar</button>
              </div>
            )}
          </div>

          <div className="p-4 space-y-1">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2">Canales de la Empresa</p>
            {channels.map((ch) => (
              <button 
                key={ch.id} 
                onClick={() => { setCurrentChannel({ ...ch, type: 'channel' }); setMobileMenuOpen(false); }} 
                className={`w-full text-left p-3 rounded-xl font-bold text-sm transition cursor-pointer ${currentChannel?.id === ch.id && currentChannel?.type !== 'dm' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                # {ch.name}
              </button>
            ))}
          </div>

          {/* LISTA DE MIEMBROS PARA MP Y LLAMADAS */}
          <div className="p-4 border-t border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2 flex items-center">
              <Users className="w-3 h-3 mr-1.5" /> Miembros (Chats Privados & Llamadas)
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {companyMembers.map((m, idx) => (
                <div key={idx} className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition ${currentChannel?.id === m.id && currentChannel?.type === 'dm' ? 'bg-indigo-600/30 border-indigo-500' : 'bg-slate-950/60 border-slate-800/60'}`}>
                  <div onClick={() => openDirectMessage(m)} className="flex items-center space-x-2 truncate cursor-pointer flex-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="font-semibold text-slate-200 truncate">{m.name || m.email} {m.id === user?.id ? '(Tú)' : ''}</span>
                  </div>
                  {m.id !== user?.id && (
                    <div className="flex space-x-1">
                      <button onClick={() => openDirectMessage(m)} className="p-1.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-lg transition cursor-pointer" title="Mensaje Privado">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => callMember(m)} className="p-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-lg transition cursor-pointer" title="Llamar">
                        <PhoneCall className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="truncate pr-2">
            <p className="text-xs font-bold text-slate-200 truncate">{user?.name}</p>
            <p className="text-[10px] text-slate-500 capitalize">{user?.role}</p>
          </div>
          <button onClick={logout} className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-xl cursor-pointer" title="Cerrar Sesión"><LogOut className="w-4 h-4" /></button>
        </div>
      </div>

      {/* PANEL CENTRAL */}
      <div className="flex-1 flex flex-col bg-slate-950 h-full w-full">
        <div className="h-16 border-b border-slate-800 px-4 md:px-6 flex justify-between items-center bg-slate-900/50">
          <span className="text-base md:text-lg font-bold truncate pl-12 md:pl-0">
            {isRemoteActive ? `🖥️ AnyDesk (${remoteId})` : isVideoCallActive ? `📹 Videollamada con ${activeCallUser?.name}` : currentChannel?.type === 'dm' ? `💬 MP: ${currentChannel?.name}` : `#${currentChannel?.name}`}
          </span>
          <div className="flex items-center space-x-2">
            {user?.role === 'owner' && (
              <button onClick={() => setView('BILLING')} className="bg-slate-800 hover:bg-slate-700 text-indigo-400 px-3 py-2 rounded-xl text-xs font-bold border border-slate-700 hidden md:block cursor-pointer">Suscripción</button>
            )}

            {!isRemoteActive ? (
              <button onClick={startRemoteSession} className="bg-amber-600 hover:bg-amber-500 px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-xs md:text-sm font-bold flex items-center cursor-pointer"><Monitor className="w-4 h-4 mr-1 md:mr-2" /> AnyDesk</button>
            ) : (
              <button onClick={stopRemoteSession} className="bg-rose-600 hover:bg-rose-500 px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-xs md:text-sm font-bold flex items-center cursor-pointer"><Square className="w-4 h-4 mr-1 md:mr-2" /> Salir</button>
            )}

            {!isVideoCallActive ? (
              <button onClick={() => callMember(companyMembers.find(m => m.id !== user?.id) || companyMembers[0])} className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-xs md:text-sm font-bold flex items-center cursor-pointer"><Video className="w-4 h-4 mr-1 md:mr-2" /> Videollamada HD</button>
            ) : (
              <button onClick={hangUpCall} className="bg-rose-600 hover:bg-rose-500 px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-xs md:text-sm font-bold flex items-center cursor-pointer"><Square className="w-4 h-4 mr-1 md:mr-2" /> Colgar</button>
            )}
          </div>
        </div>

        {/* CONTENIDO CENTRAL */}
        {isRemoteActive ? (
          <div className="flex-1 bg-black flex flex-col items-center justify-center p-4">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain rounded-2xl border border-slate-800" />
          </div>
        ) : isVideoCallActive ? (
          <div className="flex-1 bg-black grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
            <div className="relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center min-h-[220px]">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <span className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded-lg text-xs font-bold text-white">Tú ({user?.name})</span>
            </div>
            <div className="relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center min-h-[220px]">
              <video ref={remoteCallVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <span className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded-lg text-xs font-bold text-white">{activeCallUser?.name || 'Compañero'}</span>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {currentChannel.type === 'dm' ? (
                currentDmList.map((m) => (
                  <div key={m.id} className={`flex ${m.senderId === user?.id ? 'justify-end' : 'justify-start'}`}>
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl max-w-md shadow-md">
                      <div className="flex justify-between items-center mb-1 space-x-4">
                        <span className="text-xs font-bold text-indigo-400">{m.senderName}</span>
                        <div className="flex items-center space-x-1">
                          <span className="text-[10px] text-slate-500">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {m.senderId === user?.id && (
                            m.read ? <CheckCheck className="w-3 h-3 text-indigo-400" title="Visto" /> : <Check className="w-3 h-3 text-slate-500" title="Enviado" />
                          )}
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed">{m.body}</p>
                    </div>
                  </div>
                ))
              ) : (
                messages.map((m) => (
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
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-3 md:p-4 border-t border-slate-800 bg-slate-900/80 flex items-center space-x-3">
              <label className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer transition border border-slate-700">
                <Paperclip className="w-5 h-5 text-slate-300" />
                <input type="file" className="hidden" onChange={e => setSelectedFile(e.target.files[0])} />
              </label>
              <input type="text" placeholder={currentChannel?.type === 'dm' ? `Mensaje privado a ${currentChannel.name}...` : `Escribe en #${currentChannel?.name}...`} value={inputText} onChange={e => setInputText(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500" />
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-xl font-bold shadow-lg transition cursor-pointer"><Send className="w-5 h-5" /></button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}