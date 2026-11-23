"use client"

import { useState } from "react"
import { Settings, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useNavigate } from "react-router-dom"

export function UserMenu() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleLogout = () => {
    localStorage.removeItem("userId")
    navigate("/login")
  }

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="flex w-fit p-[3px] rounded-2xl cursor-pointer transition-colors hover:bg-black/20 dark:hover:bg-white/20">
            <div className="rounded-2xl w-full p-1 md:p-1.5">
              <a
                title="Go to about me page"
                className="text-light-blue-light hover:text-black dark:text-gray-400 inline-flex items-center p-1.5 font-medium rounded-full text-sm text-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                    clipRule="evenodd"
                  ></path>
                </svg>
              </a>
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-40 mb-2 mr-2 p-1" side="top" align="end">
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-sm"
              onClick={() => {
                setOpen(false)
                navigate("/profile")
              }}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Log Out
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
