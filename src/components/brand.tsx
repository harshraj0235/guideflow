import Link from "next/link";
export function Brand() {
    return <Link href="/" className="gf-brand" aria-label="GuideFlow home"><span className="gf-mark" aria-hidden="true">g<span>↗</span></span>guideflow<span className="gf-brand-dot">.</span></Link>;
}
