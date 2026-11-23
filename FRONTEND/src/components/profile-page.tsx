"use client"

import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Camera, Loader2, Lock, User } from "lucide-react"

// Mock User ID - In a real app, get this from Auth Context
const USER_ID = 1; 

export function ProfilePage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  const [user, setUser] = useState({
    username: "",
    email: "",
    profile_image: null as string | null
  })
  
  const [passwordData, setPasswordData] = useState({
    old_password: "",
    new_password: ""
  })
  
  const [confirmPassword, setConfirmPassword] = useState("")

  useEffect(() => {
    fetchUserProfile()
  }, [])

  const fetchUserProfile = async () => {
    try {
      const res = await fetch(`/api/user/${USER_ID}`)
      if (res.ok) {
        const data = await res.json()
        setUser(data)
      }
    } catch (error) {
      console.error("Failed to fetch user", error)
    } finally {
      setLoading(false)
    }
  }

  const handleImageClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append("file", file)

    setUploading(true)
    try {
      const res = await fetch(`/api/user/${USER_ID}/upload-image`, {
        method: "POST",
        body: formData
      })
      
      if (res.ok) {
        const data = await res.json()
        setUser(prev => ({ ...prev, profile_image: data.path }))
      } else {
        alert("Failed to upload image")
      }
    } catch (error) {
      console.error("Upload error", error)
    } finally {
      setUploading(false)
    }
  }

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    const currentPassword = prompt("Please enter your current password to confirm changes:")
    if (!currentPassword) return

    setSaving(true)
    try {
      const res = await fetch(`/api/user/${USER_ID}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: user.username,
          email: user.email,
          current_password: currentPassword
        })
      })

      if (res.ok) {
        alert("Profile updated successfully")
      } else {
        const err = await res.json()
        alert(`Error: ${err.detail}`)
      }
    } catch (error) {
      console.error("Update error", error)
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordData.new_password !== confirmPassword) {
      alert("New passwords do not match")
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/user/${USER_ID}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwordData)
      })

      if (res.ok) {
        alert("Password updated successfully")
        setPasswordData({ old_password: "", new_password: "" })
        setConfirmPassword("")
      } else {
        const err = await res.json()
        alert(`Error: ${err.detail}`)
      }
    } catch (error) {
      console.error("Password update error", error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>
  }

  return (
      <div className="min-h-screen p-4 md:p-8 text-foreground bg-transparent max-w-4xl mx-auto">
        <Button 
            variant="ghost" 
            className="mb-6 pl-0 hover:bg-transparent hover:text-primary"
            onClick={() => navigate("/")}
        >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
        </Button>

        <div className="grid gap-6">
            {/* Profile Card */}
            <Card className="bg-card/80 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle>Profile Settings</CardTitle>
                    <CardDescription>Manage your public profile and account settings.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-8 items-start">
                        {/* Profile Image */}
                        <div className="flex flex-col items-center gap-4">
                            <div 
                                className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-muted cursor-pointer group"
                                onClick={handleImageClick}
                            >
                                {user.profile_image ? (
                                    <img src={user.profile_image} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-muted flex items-center justify-center">
                                        <User className="h-12 w-12 text-muted-foreground" />
                                    </div>
                                )}
                                
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Camera className="h-8 w-8 text-white" />
                                </div>
                                
                                {uploading && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                        <Loader2 className="h-8 w-8 text-white animate-spin" />
                                    </div>
                                )}
                            </div>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                            <p className="text-xs text-muted-foreground text-center">Click to upload new image</p>
                        </div>

                        {/* Profile Form */}
                        <form onSubmit={handleProfileUpdate} className="flex-1 space-y-4 w-full">
                            <div className="space-y-2">
                                <Label htmlFor="username">Username</Label>
                                <Input 
                                    id="username" 
                                    value={user.username} 
                                    onChange={(e) => setUser({...user, username: e.target.value})}
                                    maxLength={25}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input 
                                    id="email" 
                                    type="email" 
                                    value={user.email} 
                                    onChange={(e) => setUser({...user, email: e.target.value})}
                                />
                            </div>
                            <Button type="submit" disabled={saving}>
                                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </form>
                    </div>
                </CardContent>
            </Card>

            {/* Password Card */}
            <Card className="bg-card/80 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle>Security</CardTitle>
                    <CardDescription>Change your password.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handlePasswordUpdate} className="space-y-4 max-w-md">
                        <div className="space-y-2">
                            <Label htmlFor="old-password">Current Password</Label>
                            <div className="relative">
                                <Lock className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    id="old-password" 
                                    type="password" 
                                    className="pl-8"
                                    value={passwordData.old_password}
                                    onChange={(e) => setPasswordData({...passwordData, old_password: e.target.value})}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="new-password">New Password</Label>
                            <div className="relative">
                                <Lock className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    id="new-password" 
                                    type="password" 
                                    className="pl-8"
                                    value={passwordData.new_password}
                                    onChange={(e) => setPasswordData({...passwordData, new_password: e.target.value})}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirm New Password</Label>
                            <div className="relative">
                                <Lock className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    id="confirm-password" 
                                    type="password" 
                                    className="pl-8"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                            </div>
                        </div>
                        <Button type="submit" variant="secondary" disabled={saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Update Password
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
      </div>
  )
}
