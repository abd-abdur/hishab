import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { signOut } from "@/lib/auth-client";

const IDLE_MS = 30 * 60 * 1000; // sign out after 30 quiet minutes
const WARNING_MS = 60 * 1000; // ... with a 60-second warning first
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Signs the user out after 30 minutes without interaction — with a one-minute
 * "still there?" warning so nobody loses in-progress work silently. The server
 * expires the session on the same clock.
 */
export function IdleLogout() {
  const navigate = useNavigate();
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  useEffect(() => {
    const logout = () => {
      void signOut().finally(() => {
        toast.info("Signed out after 30 minutes of inactivity.");
        void navigate({ to: "/login" });
      });
    };

    const arm = () => {
      if (warnTimer.current) clearTimeout(warnTimer.current);
      if (logoutTimer.current) clearTimeout(logoutTimer.current);
      setWarning(false);
      warnTimer.current = setTimeout(() => {
        setWarning(true);
        setSecondsLeft(Math.round(WARNING_MS / 1000));
        logoutTimer.current = setTimeout(logout, WARNING_MS);
      }, IDLE_MS - WARNING_MS);
    };

    // activity only re-arms the clock while the warning isn't showing —
    // once warned, staying signed in is an explicit choice
    const onActivity = () => {
      setWarning((current) => {
        if (!current) arm();
        return current;
      });
    };

    arm();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    return () => {
      if (warnTimer.current) clearTimeout(warnTimer.current);
      if (logoutTimer.current) clearTimeout(logoutTimer.current);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [navigate]);

  // countdown display while the warning is open
  useEffect(() => {
    if (!warning) return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [warning]);

  const stay = () => {
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    setWarning(false);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    warnTimer.current = setTimeout(() => {
      setWarning(true);
      setSecondsLeft(Math.round(WARNING_MS / 1000));
      logoutTimer.current = setTimeout(() => {
        void signOut().finally(() => void navigate({ to: "/login" }));
      }, WARNING_MS);
    }, IDLE_MS - WARNING_MS);
  };

  return (
    <AlertDialog open={warning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Still there?</AlertDialogTitle>
          <AlertDialogDescription>
            You'll be signed out in {secondsLeft} second{secondsLeft === 1 ? "" : "s"} to protect
            your data. Unsaved statement reviews are kept and restored when you sign back in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={stay}>Stay signed in</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
