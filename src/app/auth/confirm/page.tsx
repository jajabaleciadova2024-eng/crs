import { Suspense } from "react";
import AuthConfirmForm from "./AuthConfirmForm";

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={null}>
      <AuthConfirmForm />
    </Suspense>
  );
}
