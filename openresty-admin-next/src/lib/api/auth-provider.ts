import { config } from '@/lib/config/env';

const authProvider = {
  login: async (params: { email: string; password: string }) => {
    const request = new Request(`${config.apiUrl}/user/login`, {
      method: 'POST',
      body: JSON.stringify({ email: params.email, password: params.password }),
      headers: new Headers({ Accept: 'application/json', 'Content-Type': 'application/json' }),
    });
    await fetch(request)
      .then((response) => {
        if (response.status < 200 || response.status >= 300) throw new Error(response.statusText);
        return response.json();
      })
      .then(({ data }) => {
        const expiryDate = new Date();
        const { accessToken, instance } = data;
        expiryDate.setSeconds(expiryDate.getSeconds() + 3600);
        const token = { accessToken, expiryDate: expiryDate.toISOString() };
        localStorage.setItem('token', JSON.stringify(token));
        localStorage.setItem('instance', JSON.stringify(instance));
      });
    return Promise.resolve();
  },
  checkError: (error: { status?: number }) => {
    const status = error.status;
    if (status === 401 || status === 403) {
      localStorage.removeItem('token');
      return Promise.reject();
    }
    return Promise.resolve();
  },
  checkAuth: () => localStorage.getItem('token') ? Promise.resolve() : Promise.reject(),
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('storageManagement');
    return Promise.resolve();
  },
  getIdentity: () => Promise.resolve({ id: 'user', fullName: 'Admin User' }),
  getPermissions: () => localStorage.getItem('token') ? Promise.resolve() : Promise.reject(),
};

export default authProvider;
