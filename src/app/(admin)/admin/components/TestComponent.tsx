'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function TestComponent() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    setToken(storedToken || 'No token found');
  }, []);

  const testAuth = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      console.log('Auth response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Auth data:', data);
        setUser(data);
      } else {
        const errorText = await response.text();
        console.error('Auth error:', errorText);
        setUser({ error: errorText });
      }
    } catch (error) {
      console.error('Auth test error:', error);
      setUser({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const testStats = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/stats', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      console.log('Stats response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Stats data:', data);
        setUser(data);
      } else {
        const errorText = await response.text();
        console.error('Stats error:', errorText);
        setUser({ error: errorText });
      }
    } catch (error) {
      console.error('Stats test error:', error);
      setUser({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Test Component</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-medium mb-2">Token:</h3>
            <p className="text-sm bg-gray-100 p-2 rounded break-all">{token}</p>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={testAuth} disabled={loading}>
              {loading ? 'Testing...' : 'Test Auth'}
            </Button>
            <Button onClick={testStats} disabled={loading}>
              {loading ? 'Testing...' : 'Test Stats'}
            </Button>
          </div>
          
          {user && (
            <div>
              <h3 className="font-medium mb-2">Response:</h3>
              <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto">
                {JSON.stringify(user, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
