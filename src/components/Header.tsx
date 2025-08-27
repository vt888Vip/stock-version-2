"use client"

import { useRouter, usePathname } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { useState, useEffect } from "react"
import { useAuth } from "@/lib/useAuth"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { User as UserIcon, LogOut, Wallet, CreditCard, ArrowUpRight, ArrowDownLeft, 
  Clock, ChevronDown, Phone, Menu, X, Headphones } from "lucide-react"
import loading from "@/app/(auth)/login/loading"

export default function Header() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [isWalletDropdownOpen, setIsWalletDropdownOpen] = useState(false)
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)
  const [isMobileUserDropdownOpen, setIsMobileUserDropdownOpen] = useState(false)

  // Handle scrolling effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleLogout = async () => {
    try {
      await logout()
      router.push("/")
    } catch (error) {
      console.error("Logout error:", error)
    }
  }
  
  // Track pathname for route changes
  const pathname = usePathname()
  
  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false)
    setIsWalletDropdownOpen(false)
    setIsUserDropdownOpen(false)
    setIsMobileUserDropdownOpen(false)
  }, [pathname])

  return (
    <header className={`bg-white border-b border-gray-100 sticky top-0 z-50 ${scrolled ? 'shadow-md' : 'shadow-sm'}`}>
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                 {/* Left side: Logo and Navigation */}
         <div className="flex items-center">
           {/* Logo */}
           <Link href="/" className="flex items-center mr-4">
             <Image 
               src="/logo.png" 
               alt="London HSC" 
               width={120} 
               height={100} 
               className="h-10 w-auto"
               priority
             />
           </Link>
           
           {/* Desktop Navigation - chỉ hiển thị khi đã đăng nhập */}
           {user && (
             <div className="hidden md:flex items-center space-x-2">
               <Link href="/">
                 <Button
                   variant="outline"
                   size="sm"
                   className="text-blue-600 border-blue-600 bg-white hover:bg-blue-50"
                 >
                   Trang chủ
                 </Button>
               </Link>
               <Link href="/trade">
                 <Button
                   variant="outline"
                   size="sm"
                   className="text-blue-600 border-blue-600 bg-white hover:bg-blue-50"
                 >
                   Giao dịch
                 </Button>
               </Link>
               
               {/* Thêm các chức năng ví trực tiếp vào navigation */}
               <Link href="/deposit">
                 <Button
                   variant="outline"
                   size="sm"
                   className="text-blue-600 border-blue-600 bg-white hover:bg-green-50"
                 >
                   <ArrowDownLeft className="h-4 w-4 mr-1" />
                   Nạp tiền
                 </Button>
               </Link>
               <Link href="/withdraw">
                 <Button
                   variant="outline"
                   size="sm"
                   className="text-blue-600 border-blue-600 bg-white hover:bg-green-50"
                 >
                   <ArrowUpRight className="h-4 w-4 mr-1" />
                   Rút tiền
                 </Button>
               </Link>
               <Link href="/transaction-history">
                 <Button
                   variant="outline"
                   size="sm"
                   className="text-blue-600 border-blue-600 bg-white hover:bg-green-50"
                 >
                   <Clock className="h-4 w-4 mr-1" />
                   Lịch sử giao dịch
                 </Button>
               </Link>
             </div>
           )}
         </div>
        
                 {/* Right side */}
         <div className="flex items-center gap-3">
          
                     {/* Mobile menu button - chỉ hiển thị khi đã đăng nhập */}
                       {user && (
              <div className="flex items-center gap-1 md:hidden">
                {/* Menu button */}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-10 w-10"
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                >
                  {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                </Button>
                
                                 {/* Avatar button with dropdown */}
                 <DropdownMenu open={isMobileUserDropdownOpen} onOpenChange={setIsMobileUserDropdownOpen}>
                   <DropdownMenuTrigger asChild>
                     <Button 
                       variant="ghost" 
                       size="icon" 
                       className="rounded-full overflow-hidden h-8 w-8"
                     >
                       <Image 
                         src={user.avatar || "/avatars/default.png"} 
                         alt={user.username || "User"} 
                         width={32} 
                         height={32} 
                         className="h-full w-full object-cover"
                       />
                     </Button>
                   </DropdownMenuTrigger>
                   <DropdownMenuContent align="end" className="w-48">
                     {/* Username display */}
                     <div className="px-3 py-2 text-sm font-medium">{user.username || 'tdnm'}</div>
                     
                     <DropdownMenuItem onClick={() => setIsMobileUserDropdownOpen(false)}>
                       <Link href="/account" className="flex items-center w-full text-xs">
                         <span>Tổng quan tài khoản</span>
                       </Link>
                     </DropdownMenuItem>
                     
                     <DropdownMenuItem onClick={() => setIsMobileUserDropdownOpen(false)}>
                       <Link href="/account?tab=password" className="flex items-center w-full text-xs">
                         <span>Cài đặt bảo mật</span>
                       </Link>
                     </DropdownMenuItem>
                     
                     <DropdownMenuItem onClick={() => setIsMobileUserDropdownOpen(false)}>
                       <Link href="/account?tab=verification" className="flex items-center w-full text-xs">
                         <span>Xác minh danh tính</span>
                       </Link>
                     </DropdownMenuItem>
                     
                     <DropdownMenuSeparator />
                     
                     <DropdownMenuItem onClick={() => {
                       setIsMobileUserDropdownOpen(false)
                       handleLogout()
                     }}>
                       <span className="text-xs">Đăng xuất</span>
                     </DropdownMenuItem>
                   </DropdownMenuContent>
                 </DropdownMenu>
              </div>
            )}
          
                                 {/* User Account dropdown */}
            {user ? (
              <div className="flex items-center gap-2">
                {/* CSKH button - chỉ hiển thị trên desktop khi đã đăng nhập */}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="hidden md:flex text-blue-600 hover:bg-blue-50 gap-2"
                  onClick={() => window.open("https://t.me/DICHVUCSKHLSE", "_blank")}
                >
                  <Headphones className="h-4 w-4" />
                  CSKH
                </Button>
                
                                 <DropdownMenu open={isUserDropdownOpen} onOpenChange={setIsUserDropdownOpen}>
                   <DropdownMenuTrigger asChild>
                     <Button variant="outline" size="sm" className="gap-2 hidden md:flex">
                       <span>Tài khoản</span>
                       <ChevronDown className="h-4 w-4" />
                     </Button>
                   </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {/* Username display */}
                  <div className="px-4 py-2 text-sm font-medium">{user.username || 'tdnm'}</div>
                  
                  <DropdownMenuItem onClick={() => setIsUserDropdownOpen(false)}>
                    <Link href="/account" className="flex items-center w-full">
                      <span>Tổng quan tài khoản</span>
                    </Link>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={() => setIsUserDropdownOpen(false)}>
                    <Link href="/account?tab=password" className="flex items-center w-full">
                      <span>Cài đặt bảo mật</span>
                    </Link>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={() => setIsUserDropdownOpen(false)}>
                    <Link href="/account?tab=verification" className="flex items-center w-full">
                      <span>Xác minh danh tính</span>
                    </Link>
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem onClick={() => {
                    setIsUserDropdownOpen(false)
                    handleLogout()
                  }}>
                    <span>Đăng xuất</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
           </div>
                         ) : (
                               <div className="flex items-center gap-2">
                  <Link href="/login">
                    <Button 
                      variant="default" 
                      size="sm" 
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-2 h-9"
                    >
                      <span>Đăng nhập</span>
                    </Button>
                  </Link>
                  <Link href="/register">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="border-blue-600 text-blue-600 hover:bg-blue-50 text-xs px-3 py-2 h-9"
                    >
                      <span>Đăng ký</span>
                    </Button>
                  </Link>
                </div>
             )}
        </div>
      </div>
      
      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#f7faff]">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center">
              <Image 
                src="/logo.png" 
                alt="London LLEG EXCHANGE" 
                width={180} 
                height={60} 
                className="h-12 w-auto"
              />
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-gray-500 h-10 w-10"
            >
              <X className="h-7 w-7" />
            </Button>
          </div>
          
          <div className="flex-1 overflow-auto">
            {user ? (
              // Mobile menu khi đã đăng nhập
              <>
                <nav className="flex flex-col w-full">
                  <Link 
                    href="/" 
                    className="py-4 px-5 border-b border-gray-200 text-base"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Trang chủ
                  </Link>
                  <Link 
                    href="/trade" 
                    className="py-4 px-5 border-b border-gray-200 text-base"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Giao dịch
                  </Link>
                  <Link 
                    href="/transaction-history" 
                    className="py-4 px-5 border-b border-gray-200 text-base"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Lịch sử giao dịch
                  </Link>
                  <Link 
                    href="/account" 
                    className="py-4 px-5 border-b border-gray-200 text-base"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Tổng quan tài khoản
                  </Link>
                  <Link 
                    href="/account?tab=password" 
                    className="py-4 px-5 border-b border-gray-200 text-base"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Đổi mật khẩu
                  </Link>
                  <Link 
                    href="/account?tab=verification" 
                    className="py-4 px-5 border-b border-gray-200 text-base"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Xác minh danh tính
                  </Link>
                </nav>
                
                <div className="grid grid-cols-2 gap-4 p-5 mt-4">
                  <Link 
                    href="/deposit" 
                    className="bg-green-600 text-white py-3 px-4 rounded-md flex justify-center items-center font-medium text-base"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Nạp tiền
                  </Link>
                  <Link 
                    href="/withdraw" 
                    className="bg-green-600 text-white py-3 px-4 rounded-md flex justify-center items-center font-medium text-base"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Rút tiền
                  </Link>
                </div>
                
                {/* CSKH button for mobile */}
                <div className="px-5 pb-4">
                  <button 
                    onClick={() => {
                      setIsMobileMenuOpen(false)
                      window.open("https://t.me/DICHVUCSKHLSE", "_blank")
                    }}
                    className="w-full bg-blue-600 text-white py-3 px-4 rounded-md flex justify-center items-center font-medium text-base gap-2"
                  >
                    <Headphones className="h-4 w-4" />
                    Chăm sóc khách hàng
                  </button>
                </div>
                
                <div className="px-5 pb-6">
                  <button 
                    onClick={() => {
                      setIsMobileMenuOpen(false)
                      handleLogout()
                    }}
                    className="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-md flex justify-center items-center font-medium text-base"
                  >
                    Đăng xuất
                  </button>
                </div>
              </>
            ) : (
              // Mobile menu khi chưa đăng nhập
              <>
                <nav className="flex flex-col w-full">
                  <Link 
                    href="/" 
                    className="py-4 px-5 border-b border-gray-200 text-base"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Trang chủ
                  </Link>
                  <Link 
                    href="/about" 
                    className="py-4 px-5 border-b border-gray-200 text-base"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Giới thiệu
                  </Link>
                  <Link 
                    href="/contact" 
                    className="py-4 px-5 border-b border-gray-200 text-base"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Liên hệ
                  </Link>
                </nav>
                
                <div className="grid grid-cols-2 gap-4 p-5 mt-4">
                  <Link 
                    href="/login" 
                    className="bg-blue-600 text-white py-3 px-4 rounded-md flex justify-center items-center font-medium text-base"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Đăng nhập
                  </Link>
                  <Link 
                    href="/register" 
                    className="bg-green-600 text-white py-3 px-4 rounded-md flex justify-center items-center font-medium text-base"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Đăng ký
                  </Link>
                </div>
                
                {/* CSKH button for mobile */}
                <div className="px-5 pb-4">
                  <button 
                    onClick={() => {
                      setIsMobileMenuOpen(false)
                      window.open("https://t.me/DICHVUCSKHLSE", "_blank")
                    }}
                    className="w-full bg-blue-600 text-white py-3 px-4 rounded-md flex justify-center items-center font-medium text-base gap-2"
                  >
                    <Headphones className="h-4 w-4" />
                    Chăm sóc khách hàng
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}