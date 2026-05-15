import { Link } from "@tanstack/react-router";
import logo from "@/assets/clubero-logo.png";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center" aria-label="Clubero">
              <img src={logo} alt="Clubero" className="h-11 w-auto object-contain" />
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              La coordination d&apos;équipe, simplifiée pour les clubs sportifs.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Produit
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li><Link to="/features" className="hover:text-foreground">Fonctionnalités</Link></li>
              <li><Link to="/pricing" className="hover:text-foreground">Tarifs</Link></li>
              <li><Link to="/demo" className="hover:text-foreground">Demander une démo</Link></li>
              <li><Link to="/login" className="hover:text-foreground">Connexion</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Société
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li><Link to="/faq" className="hover:text-foreground">FAQ</Link></li>
              <li><Link to="/contact" className="hover:text-foreground">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Légal
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li>
                <Link to="/legal/$kind" params={{ kind: "terms" }} className="hover:text-foreground">
                  Conditions d&apos;utilisation
                </Link>
              </li>
              <li>
                <Link to="/legal/$kind" params={{ kind: "privacy" }} className="hover:text-foreground">
                  Politique de confidentialité
                </Link>
              </li>
              <li>
                <Link to="/legal/$kind" params={{ kind: "legal_notice" }} className="hover:text-foreground">
                  Mentions légales
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Clubero. Tous droits réservés.</p>
          <p>Pensé pour les clubs, coachs, parents et joueurs.</p>
        </div>
      </div>
    </footer>
  );
}
