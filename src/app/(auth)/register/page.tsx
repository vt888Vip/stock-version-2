'use client';

// Ensure React is loaded first
import React, { useState, useEffect } from 'react';

// Import other dependencies
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react';

// Import the React global initializer
import '@/lib/ensure-react';

// Hàm kiểm tra tên tài khoản có hợp lệ không (không dấu, không khoảng trắng)
const validateUsername = (username: string): { isValid: boolean; message: string } => {
  if (!username) {
    return { isValid: false, message: 'Tên đăng nhập không được để trống' };
  }
  
  if (username.length < 3) {
    return { isValid: false, message: 'Tên đăng nhập phải có ít nhất 3 ký tự' };
  }
  
  // Kiểm tra có ký tự có dấu không
  const vietnameseRegex = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
  if (vietnameseRegex.test(username)) {
    return { isValid: false, message: 'Tên đăng nhập không được chứa dấu' };
  }
  
  // Kiểm tra có khoảng trắng không
  if (/\s/.test(username)) {
    return { isValid: false, message: 'Tên đăng nhập không được chứa khoảng trắng' };
  }
  
  // Kiểm tra chỉ chứa chữ cái, số và dấu gạch dưới
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { isValid: false, message: 'Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới' };
  }
  
  return { isValid: true, message: '' };
};

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isAutoLogin, setIsAutoLogin] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [preventAutoRedirect, setPreventAutoRedirect] = useState(false)

  const router = useRouter()
  const { isAuthenticated, isAdmin, refreshUser } = useAuth()

  // Redirect if already authenticated
  useEffect(() => {
    // Chỉ redirect nếu đã authenticated và không đang trong quá trình đăng ký
    if (isAuthenticated() && !isLoading && !isAutoLogin && !isRedirecting && !preventAutoRedirect) {
      // Kiểm tra flag preventRedirect
      const preventRedirect = localStorage.getItem('preventRedirect')
      if (preventRedirect === 'true') {
        return
      }
      
      if (isAdmin()) {
        router.push("/admin")
      } else {
        router.push("/")
      }
    }
  }, [isAuthenticated, isAdmin, router, isLoading, isAutoLogin, isRedirecting, preventAutoRedirect])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    // Clear errors when user starts typing
    if (error) setError("")
  }

  const validateForm = () => {
    // Validate username
    const usernameValidation = validateUsername(formData.username);
    if (!usernameValidation.isValid) {
      setError(usernameValidation.message);
      return false;
    }

    if (formData.password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự")
      return false
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Mật khẩu xác nhận không khớp")
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Ngăn chặn auto redirect trong quá trình đăng ký
    setPreventAutoRedirect(true)
    
    // Set flag để ngăn chặn redirect không mong muốn
    localStorage.setItem('preventRedirect', 'true')
    
    setError("")
    setSuccess("")

    if (!validateForm()) {
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: formData.username.trim().toLowerCase(),
          password: formData.password,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setSuccess("✅ Đăng ký thành công!")
        
        // Reset form
        setFormData({
          username: "",
          password: "",
          confirmPassword: "",
        })

        // Bắt đầu quá trình đăng nhập tự động
        setIsAutoLogin(true)
        setSuccess("✅ Đăng ký thành công! Đang đăng nhập tự động...")

        // Delay ngắn để user thấy thông báo
        await new Promise(resolve => setTimeout(resolve, 800))

        try {
          const loginResponse = await fetch("/api/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              username: formData.username.trim().toLowerCase(),
              password: formData.password,
            }),
          })

          const loginData = await loginResponse.json()

          if (loginData.success && loginData.token) {
            // Lưu token vào localStorage
            localStorage.setItem('authToken', loginData.token)
            localStorage.setItem('token', loginData.token)
            
            setSuccess("🎉 Đăng ký và đăng nhập thành công!")
            setIsAutoLogin(false)
            setIsRedirecting(true)
            
            // Cập nhật authentication state
            await refreshUser()
            
            // Chuyển hướng mượt mà
            localStorage.removeItem('preventRedirect')
            setTimeout(() => {
              window.location.replace("/")
            }, 1000)
          } else {
            throw new Error("Đăng nhập tự động thất bại")
          }
        } catch (loginError) {
          setIsAutoLogin(false)
          setSuccess("✅ Đăng ký thành công! Vui lòng đăng nhập để tiếp tục.")
          setTimeout(() => {
            router.push("/login")
          }, 2000)
        }
      } else {
        setError(data.message || "Đăng ký thất bại")
        // Clear flag khi có lỗi
        localStorage.removeItem('preventRedirect')
      }
    } catch (error: any) {
      console.error("Registration error:", error)
      setError("Đã xảy ra lỗi khi đăng ký. Vui lòng thử lại sau.")
      // Clear flag khi có lỗi
      localStorage.removeItem('preventRedirect')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-2">
      <Card className="w-full max-w-md sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl relative z-10 bg-white/95 backdrop-blur-sm border-0 shadow-2xl flex flex-col items-center p-0">
        {/* Logo-london.jpg ở trên cùng card */}
        <div className="w-full h-28 sm:h-24 md:h-32 rounded-t-xl overflow-hidden flex items-center justify-center bg-gray-200">
          <img
            src="/logo-london.jpg"
            alt="Banner"
            className="w-full h-full object-cover"
            style={{ minHeight: 80, maxHeight: 140 }}
          />
        </div>
        <CardHeader className="space-y-1 w-full px-4 pt-4 pb-2">
          <CardTitle className="text-xl md:text-2xl font-bold text-center">Tạo tài khoản</CardTitle>
          <CardDescription className="text-center text-sm md:text-base">Nhập thông tin để tạo tài khoản mới</CardDescription>
        </CardHeader>
        <CardContent className="w-full px-4 pb-4">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className={`mb-4 border-green-200 bg-green-50 transition-all duration-300 ${isRedirecting ? 'animate-pulse' : ''}`}>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Tên đăng nhập</Label>
                             <Input
                 id="username"
                 name="username"
                 type="text"
                 value={formData.username}
                 onChange={handleChange}
                 required
                 minLength={3}
                 placeholder="Nhập tên đăng nhập (không dấu, không khoảng trắng)"
                 disabled={isLoading || isAutoLogin || isRedirecting}
                 className="transition-all duration-200"
               />
               <p className="text-xs text-gray-500">
                 Tên đăng nhập: không dấu, không khoảng trắng, chỉ chữ cái, số và dấu gạch dưới
               </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleChange}
                  required
                  minLength={6}
                  placeholder="Nhập mật khẩu (ít nhất 6 ký tự)"
                  disabled={isLoading || isAutoLogin || isRedirecting}
                  className="transition-all duration-200"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading || isAutoLogin || isRedirecting}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Nhập lại mật khẩu</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  minLength={6}
                  placeholder="Nhập lại mật khẩu"
                  disabled={isLoading || isAutoLogin || isRedirecting}
                  className="transition-all duration-200"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={isLoading || isAutoLogin || isRedirecting}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full transition-all duration-200" 
              disabled={isLoading || isAutoLogin || isRedirecting}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang đăng ký...
                </>
              ) : isAutoLogin ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang đăng nhập tự động...
                </>
              ) : isRedirecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang chuyển hướng...
                </>
              ) : (
                "Đăng ký"
              )}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm">
            <span className="text-gray-600">Đã có tài khoản? </span>
            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
              Đăng nhập ngay
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
