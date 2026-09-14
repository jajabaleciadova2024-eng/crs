import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/ui";

type QuickLink = {
  title: string;
  url: string;
  description: string;
  icon: string;
};

type LinkGroup = {
  heading: string;
  links: QuickLink[];
};

const LINK_GROUPS: LinkGroup[] = [
  {
    heading: "Personal Access",
    links: [
      {
        title: "Outlook",
        url: "https://outlook.office.com/mail/",
        description: "Microsoft Outlook email — check and send work emails.",
        icon: "📧",
      },
      {
        title: "Workday",
        url: "https://wd5.myworkday.com/unisys/d/home.htmld",
        description: "Workday HR portal — payslips, time tracking, and employee info.",
        icon: "💼",
      },
      {
        title: "Payslip | ADP Global",
        url: "https://unisyscorp.sharepoint.com/sites/CSIO-Services/SitePages/Webpay-APAC.aspx",
        description: "ADP Global Payslip portal via SharePoint.",
        icon: "💰",
      },
    ],
  },
  {
    heading: "Webinar Trainings",
    links: [
      {
        title: "Percipio Trainings",
        url: "https://unisys.percipio.com/",
        description: "Skillsoft Percipio — online courses, videos, and certifications.",
        icon: "🎓",
      },
      {
        title: "ZenGuide",
        url: "https://unisys.ws02-securityeducation.com/",
        description: "Security awareness training and education portal.",
        icon: "🛡️",
      },
    ],
  },
  {
    heading: "Tools & Services",
    links: [
      {
        title: "Self-Service Password Reset",
        url: "https://uhelp.unisys.com/upreset/",
        description: "Reset your network password without contacting IT.",
        icon: "🔑",
      },
      {
        title: "Service Desk Portal",
        url: "https://unisysst.service-now.com/uis?id=index",
        description: "ServiceNow — submit tickets, check request status, and browse IT help.",
        icon: "🛠️",
      },
    ],
  },
  {
    heading: "Downloadable Apps",
    links: [
      {
        title: "Workday – iOS",
        url: "https://apps.apple.com/us/app/workday/id316800034",
        description: "Workday mobile app for iPhone and iPad.",
        icon: "🍎",
      },
      {
        title: "Workday – Android",
        url: "https://play.google.com/store/apps/details?id=com.workday.workdroidapp&pcampaignid=web_share",
        description: "Workday mobile app for Android devices.",
        icon: "🤖",
      },
      {
        title: "Skillsoft Percipio App",
        url: "https://www.skillsoft.com/percipio-app",
        description: "Percipio training app — learn on the go.",
        icon: "📱",
      },
      {
        title: "Secureauth App",
        url: "https://www.secureauth.com/resources/for-customers/support-resources/product-downloads",
        description: "SecureAuth multi-factor authentication app downloads.",
        icon: "🔐",
      },
    ],
  },
];

export default async function QuickLinksPage() {
  // Any authenticated user can see this page.
  await requireProfile();

  return (
    <>
      <PageHeader
        title="Quick Links"
        subtitle="Frequently used portals, tools, and apps — all in one place"
      />

      <div className="flex flex-col gap-6">
        {LINK_GROUPS.map((group) => (
          <section key={group.heading}>
            <h2 className="text-[13px] font-bold uppercase tracking-wider text-[var(--muted)] mb-2.5 px-1">
              {group.heading}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {group.links.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-[var(--line)] bg-[var(--paper-raised)] hover:border-[var(--accent)] hover:shadow-md transition-all group/card"
                  style={{ boxShadow: "var(--shadow-xs)" }}
                >
                  <span className="text-[24px] leading-none shrink-0" aria-hidden="true">
                    {link.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold text-[var(--ink)] group-hover/card:text-[var(--accent-strong)] transition-colors truncate">
                      {link.title}
                    </div>
                    <div className="text-[11.5px] text-[var(--muted)] leading-snug mt-0.5 line-clamp-2">
                      {link.description}
                    </div>
                  </div>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-[var(--muted)] group-hover/card:text-[var(--accent-strong)] transition-colors"
                    aria-hidden="true"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
