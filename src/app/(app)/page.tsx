import { redirect } from "next/navigation";

// Jobs will become the home screen once they're built.
export default function Home() {
  redirect("/customers");
}
