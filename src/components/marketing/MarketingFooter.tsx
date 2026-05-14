import { Link } from "@tanstack/react-router";
import logo from "@/assets/clubero-logo.png";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5">
              <img src={logo} alt="Clubero" className="h-8 w-8 rounded-lg" />
              <span className="font-display text-lg font-bold">Clubero</span>
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              Team coordination for sports clubs, made simple.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Product
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li><Link to="/features" className="hover:text-foreground">Features</Link></li>
              <li><Link to="/pricing" className="hover:text-foreground">Pricing</Link></li>
              <li><Link to="/demo" className="hover:text-foreground">Request a demo</Link></li>
              <li><Link to="/login" className="hover:text-foreground">Log in</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Company
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li><Link to="/faq" className="hover:text-foreground">FAQ</Link></li>
              <li><Link to="/contact" className="hover:text-foreground">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Legal
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li>
                <Link to="/legal/$kind" params={{ kind: "terms" }} className="hover:text-foreground">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/legal/$kind" params={{ kind: "privacy" }} className="hover:text-foreground">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/legal/$kind" params={{ kind: "legal-notice" }} className="hover:text-foreground">
                  Legal Notice
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Clubero. All rights reserved.</p>
          <p>Built for clubs, coaches, parents and players.</p>
        </div>
      </div>
    </footer>
  );
}
