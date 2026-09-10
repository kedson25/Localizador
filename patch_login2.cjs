const fs = require('fs');
const file = 'src/components/Login.tsx';
let code = fs.readFileSync(file, 'utf8');

const newCode = `import React, { useState } from 'react';
import { Handshake, Eye, EyeOff } from 'lucide-react';
import { loginUser, signupUser, User } from '../lib/auth';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (username.trim()) {
      setStep(2);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);
    
    // We allow email or username in the "username" field for login
    const res = await loginUser(username.trim(), password);
    setIsLoading(false);
    
    if (res.success && res.user) {
      onLogin(res.user);
    } else {
      setErrorMsg(res.message || 'Erro ao fazer login.');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    
    if (username.trim().length < 3) {
      setErrorMsg('Usuário deve ter pelo menos 3 caracteres.');
      return;
    }
    
    if (!email.includes('@')) {
      setErrorMsg('Insira um e-mail válido.');
      return;
    }
    
    if (password.length < 4) {
      setErrorMsg('Senha deve ter pelo menos 4 caracteres.');
      return;
    }

    setIsLoading(true);
    const res = await signupUser(username.trim(), email.trim(), password);
    setIsLoading(false);
    
    if (res.success) {
      setSuccessMsg('Cadastro realizado! Aguarde a aprovação de um Administrador.');
      setMode('login');
      setStep(1);
      setUsername('');
      setPassword('');
      setEmail('');
    } else {
      setErrorMsg(res.message || 'Erro ao criar usuário.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] flex items-center justify-center p-4">
      <div className="bg-white rounded shadow-sm border border-gray-200 w-full max-w-[400px] overflow-hidden">
        {/* Header */}
        <div className="bg-[#F9F9F9] border-b border-gray-200 py-6 flex items-center justify-center">
          <div className="w-12 h-12 bg-white rounded-full border-2 border-[#1E40AF] flex items-center justify-center relative overflow-hidden">
             <div className="absolute inset-0 bg-[#FACC15] opacity-20"></div>
             <Handshake className="w-7 h-7 text-[#1E40AF] relative z-10" />
          </div>
        </div>
        
        {/* Body */}
        <div className="p-8">
          <h2 className="text-xl text-gray-700 text-center font-medium mb-6">
            {mode === 'login' ? 'Login' : 'Criar Usuário'}
          </h2>
          
          {errorMsg && (
            <div className="mb-4 p-2 bg-red-50 border border-red-200 text-red-600 text-xs text-center rounded">
              {errorMsg}
            </div>
          )}
          
          {successMsg && (
            <div className="mb-4 p-2 bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs text-center rounded">
              {successMsg}
            </div>
          )}

          {mode === 'login' ? (
            step === 1 ? (
              <form onSubmit={handleNext} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] text-gray-600 font-medium">Username ou E-mail</label>
                  <input 
                    type="text" 
                    value={username}
                    onChange={e => { setUsername(e.target.value); setErrorMsg(''); setSuccessMsg(''); }}
                    className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
                    autoFocus
                  />
                </div>
                <button 
                  type="submit"
                  disabled={!username.trim()}
                  className="w-full bg-[#3B82F6] hover:bg-blue-600 disabled:bg-blue-300 text-white py-2.5 rounded text-sm font-medium transition-colors"
                >
                  Próximo
                </button>
                <div className="pt-2 text-center">
                  <button 
                    type="button" 
                    onClick={() => { setMode('signup'); setErrorMsg(''); setSuccessMsg(''); setUsername(''); setPassword(''); }}
                    className="text-[12px] text-blue-600 hover:underline"
                  >
                    Não tem uma conta? Criar usuário
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                     <label className="text-[13px] text-gray-600 font-medium">Password</label>
                     <button 
                       type="button" 
                       onClick={() => { setStep(1); setErrorMsg(''); setSuccessMsg(''); }}
                       className="text-[11px] text-blue-600 hover:underline"
                     >
                       Alterar usuário
                     </button>
                  </div>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password}
                      onChange={e => { setPassword(e.target.value); setErrorMsg(''); setSuccessMsg(''); }}
                      className="w-full bg-white border border-gray-300 rounded px-3 py-2 pr-10 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button 
                  type="submit"
                  disabled={!password.trim() || isLoading}
                  className="w-full bg-[#3B82F6] hover:bg-blue-600 disabled:bg-blue-300 text-white py-2.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {isLoading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>
            )
          ) : (
            <form onSubmit={handleSignup} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="space-y-1.5">
                <label className="text-[13px] text-gray-600 font-medium">Novo Username</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={e => { setUsername(e.target.value); setErrorMsg(''); setSuccessMsg(''); }}
                  className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] text-gray-600 font-medium">E-mail</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrorMsg(''); setSuccessMsg(''); }}
                  className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] text-gray-600 font-medium">Nova Senha</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={e => { setPassword(e.target.value); setErrorMsg(''); setSuccessMsg(''); }}
                    className="w-full bg-white border border-gray-300 rounded px-3 py-2 pr-10 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button 
                type="submit"
                disabled={!username.trim() || !password.trim() || !email.trim() || isLoading}
                className="w-full bg-[#3B82F6] hover:bg-blue-600 disabled:bg-blue-300 text-white py-2.5 rounded text-sm font-medium transition-colors"
              >
                {isLoading ? 'Criando...' : 'Criar Conta'}
              </button>
              <div className="pt-2 text-center">
                <button 
                  type="button" 
                  onClick={() => { setMode('login'); setStep(1); setErrorMsg(''); setSuccessMsg(''); setUsername(''); setPassword(''); }}
                  className="text-[12px] text-blue-600 hover:underline"
                >
                  Já tem uma conta? Fazer login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
`;

fs.writeFileSync(file, newCode);
console.log('Login updated for firebase auth');
