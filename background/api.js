serpdigger.api = {};

serpdigger.api.registration = {
    PAID: "paid",
    TRIAL: "trial"
};

serpdigger.api.registration.status = function (username, password, callback) {
    
    var data = new URLSearchParams();
    data.append(serpdigger.config.api.registration.status.keys.username, username);
    data.append(serpdigger.config.api.registration.status.keys.password, password);
    
    fetch(serpdigger.config.api.registration.status.url, {
        method: serpdigger.config.api.registration.status.method,
        headers: {
            "Authorization": "Basic " + btoa(serpdigger.config.api.httpuser + ":" + serpdigger.config.api.httppass),
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: data
    })
    .then(function(response) { return response.text(); })
    .then(function(text) {
        callback((text == "VALID|PAID") ? serpdigger.api.registration.PAID : serpdigger.api.registration.TRIAL);
    })
    .catch(function() {
        callback(serpdigger.api.registration.TRIAL);
    });
    
};

serpdigger.api.footprints = {};

function _parseFootprints(str) {
    return str.split(/[\n]+/g).slice(0, -1).map(function (s) {
        var s = s.split(/\*/g);
        return {
            name: s[0],
            value: s[1]
        };
    });
}

var _builtinFootprints = [
    // ── ★ LinkedIn, Apollo.io & ZoomInfo Targeted Searches ──
    { name: "★ LinkedIn Profile Contacts", value: "site:linkedin.com/in/ \"@\" \"contact info\" OR \"email\" -\"@gmail.com\" -\"@yahoo.com\"\nsite:linkedin.com/in/ \"@\" \"reach out\" OR \"get in touch\" -\"@gmail.com\" -\"@yahoo.com\"\nsite:linkedin.com/in/ \"@\" \"contact me\" OR \"email me\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ LinkedIn Company Pages", value: "site:linkedin.com/company/ \"@\" -\"@gmail.com\" -\"@yahoo.com\"\nsite:linkedin.com/company/ \"@\" \"contact\" OR \"about\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ Apollo.io Profiles", value: "site:apollo.io \"@\" \"email\" OR \"contact\" -\"@gmail.com\" -\"@yahoo.com\"\nsite:apollo.io \"@\" \"people\" OR \"contacts\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ ZoomInfo Contacts", value: "site:zoominfo.com \"@\" \"email\" OR \"contact\" -\"@gmail.com\" -\"@yahoo.com\"\nsite:zoominfo.com \"@\" \"people\" OR \"directory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ Data Platforms Combined", value: "(site:linkedin.com OR site:apollo.io OR site:zoominfo.com) \"@\" -\"@gmail.com\" -\"@yahoo.com\"\n(site:linkedin.com OR site:apollo.io OR site:zoominfo.com) \"@\" \"contact\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ LinkedIn + Apollo Combined Search", value: "(site:linkedin.com/in/ OR site:apollo.io) \"@\" CEO OR \"chief executive\" -\"@gmail.com\" -\"@yahoo.com\"\n(site:linkedin.com/in/ OR site:apollo.io) \"@\" \"founder\" OR \"co-founder\" -\"@gmail.com\" -\"@yahoo.com\"\n(site:linkedin.com/in/ OR site:apollo.io) \"@\" VP OR \"vice president\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ Professional Network Profiles", value: "\"@\" \"linkedin.com/in/\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"about.me\" OR \"linktree\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"angel.co\" OR \"crunchbase.com\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── ★ Additional B2B Data Platforms (extended coverage) ──
    { name: "★ Crunchbase Profiles", value: "site:crunchbase.com/person/ \"@\" -\"@gmail.com\" -\"@yahoo.com\"\nsite:crunchbase.com/organization/ \"@\" \"contact\" OR \"email\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ RocketReach Profiles", value: "site:rocketreach.co \"@\" \"email\" OR \"contact\" -\"@gmail.com\" -\"@yahoo.com\"\nsite:rocketreach.co \"@\" \"profile\" OR \"people\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ Lusha Contacts", value: "site:lusha.com \"@\" \"email\" OR \"contact\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ Hunter.io Discovery", value: "site:hunter.io \"@\" -\"@gmail.com\" -\"@yahoo.com\"\nsite:hunter.io/companies \"@\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ Clearbit Profiles", value: "site:clearbit.com \"@\" -\"@gmail.com\" -\"@yahoo.com\"\nsite:connect.clearbit.com \"@\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ SignalHire Profiles", value: "site:signalhire.com \"@\" \"email\" OR \"contact\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ Salesfully / Salesintel / Lead411", value: "(site:salesfully.com OR site:salesintel.com OR site:lead411.com) \"@\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ AngelList / Wellfound Founders", value: "(site:angel.co OR site:wellfound.com) \"@\" \"founder\" OR \"CEO\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ GitHub Public Email Leaks", value: "site:github.com \"@\" \"users.noreply.github.com\"\nsite:github.com/orgs \"@\" \"contact\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ Extended Data Platforms Combined", value: "(site:crunchbase.com OR site:rocketreach.co OR site:lusha.com OR site:hunter.io OR site:clearbit.com OR site:signalhire.com) \"@\" -\"@gmail.com\" -\"@yahoo.com\"\n(site:crunchbase.com OR site:rocketreach.co OR site:hunter.io) \"@\" CEO OR \"founder\" -\"@gmail.com\" -\"@yahoo.com\"\n(site:lusha.com OR site:clearbit.com OR site:signalhire.com) \"@\" \"contact\" OR \"email\" -\"@gmail.com\" -\"@yahoo.com\"" },
    
    // ── ★ Multi-Query Category Groups ──
    // These entries output multiple footprint lines, generating more query combinations
    { name: "★ All C-Suite Roles (12 queries)", value: "\"@\" CEO OR \"chief executive officer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" CFO OR \"chief financial officer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" COO OR \"chief operating officer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" CTO OR \"chief technology officer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" CMO OR \"chief marketing officer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" CIO OR \"chief information officer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" CHRO OR \"chief human resources officer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" CLO OR \"chief legal officer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" CSO OR \"chief security officer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" CDO OR \"chief data officer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" CPO OR \"chief product officer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" CRO OR \"chief revenue officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ All Sales Roles (8 queries)", value: "\"@\" \"VP Sales\" OR \"Vice President Sales\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Sales Director\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Sales Manager\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Account Executive\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Business Development\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Sales Representative\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Inside Sales\" OR \"Outside Sales\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Sales Engineer\" OR \"Solutions Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ All Marketing Roles (8 queries)", value: "\"@\" \"VP Marketing\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Marketing Director\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Marketing Manager\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Digital Marketing\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Content Marketing\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"SEO Manager\" OR \"SEM Manager\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Social Media Manager\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Brand Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ All IT & Engineering Roles (8 queries)", value: "\"@\" \"VP Engineering\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Engineering Manager\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Software Engineer\" OR \"Software Developer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"DevOps Engineer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Data Scientist\" OR \"Data Engineer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"IT Director\" OR \"IT Manager\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Systems Administrator\" OR \"Network Engineer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Security Engineer\" OR \"Cybersecurity\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ All HR Roles (6 queries)", value: "\"@\" \"HR Director\" OR \"Human Resources Director\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"HR Manager\" OR \"Human Resources Manager\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Recruiter\" OR \"Talent Acquisition\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"HR Business Partner\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Compensation\" OR \"Benefits Manager\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Learning\" OR \"Training Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ All Finance Roles (6 queries)", value: "\"@\" \"Finance Director\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Controller\" OR \"Comptroller\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Accountant\" OR \"CPA\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Financial Analyst\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Treasurer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Auditor\" OR \"Internal Audit\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ All Operations Roles (6 queries)", value: "\"@\" \"Operations Director\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Operations Manager\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Supply Chain\" OR \"Logistics Manager\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Project Manager\" OR \"Program Manager\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Quality Manager\" OR \"Quality Assurance\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Procurement\" OR \"Purchasing Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ All Legal Roles (5 queries)", value: "\"@\" \"General Counsel\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Attorney\" OR \"Lawyer\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Legal Director\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Paralegal\" OR \"Legal Assistant\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Compliance Officer\" OR \"Contract Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ Executive + Management (10 queries)", value: "\"@\" CEO OR \"chief executive\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" CFO OR \"chief financial\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" CTO OR \"chief technology\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" COO OR \"chief operating\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Vice President\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Managing Director\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"Executive Director\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" Director -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"General Manager\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" Founder OR \"Co-Founder\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ Contact & About Pages (4 queries)", value: "\"@\" \"contact us\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"about us\" OR \"our team\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"staff directory\" OR \"team members\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"info@\" OR \"contact@\" OR \"sales@\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ Membership Directories (8 queries)", value: "\"@\" \"member directory\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"member list\" OR \"membership list\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"members email\" OR \"email directory\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"association members\" OR \"chapter members\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"member email\" OR \"roster\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"alumni directory\" OR \"alumni list\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"professional directory\" OR \"business directory\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"directory listing\" OR \"find a member\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ Email Lists & Directories (6 queries)", value: "\"@\" \"email list\" OR \"mailing list\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"email directory\" OR \"email database\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"contact list\" OR \"contact directory\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"people directory\" OR \"people finder\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"company directory\" OR \"corporate directory\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"staff list\" OR \"employee directory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "★ Association & Chamber (6 queries)", value: "\"@\" \"chamber of commerce\" \"members\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"trade association\" \"members\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"professional association\" \"directory\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"industry association\" \"members\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"bar association\" \"directory\" -\"@gmail.com\" -\"@yahoo.com\"\n\"@\" \"medical association\" OR \"dental association\" \"directory\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Membership Directory & Email List Footprints ──
    { name: "Directory: Member Directory", value: "\"@\" \"member directory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Member List", value: "\"@\" \"member list\" OR \"membership list\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Members Email", value: "\"@\" \"members email\" OR \"member email\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Email Directory", value: "\"@\" \"email directory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Email List", value: "\"@\" \"email list\" OR \"mailing list\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Contact Directory", value: "\"@\" \"contact directory\" OR \"contact list\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Staff Directory", value: "\"@\" \"staff directory\" OR \"staff list\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Employee Directory", value: "\"@\" \"employee directory\" OR \"employee list\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Faculty Directory", value: "\"@\" \"faculty directory\" OR \"faculty list\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: People Directory", value: "\"@\" \"people directory\" OR \"people finder\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Company Directory", value: "\"@\" \"company directory\" OR \"corporate directory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Business Directory", value: "\"@\" \"business directory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Professional Directory", value: "\"@\" \"professional directory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Alumni Directory", value: "\"@\" \"alumni directory\" OR \"alumni list\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Association Members", value: "\"@\" \"association members\" OR \"chapter members\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Chamber of Commerce", value: "\"@\" \"chamber of commerce\" \"members\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Trade Association", value: "\"@\" \"trade association\" \"members\" OR \"directory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Find a Member", value: "\"@\" \"find a member\" OR \"search members\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Member Roster", value: "\"@\" \"member roster\" OR \"roster\" \"email\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Directory Listing", value: "\"@\" \"directory listing\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Vendor Directory", value: "\"@\" \"vendor directory\" OR \"supplier directory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Contractor Directory", value: "\"@\" \"contractor directory\" OR \"contractor list\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Agent Directory", value: "\"@\" \"agent directory\" OR \"agent list\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Realtor Directory", value: "\"@\" \"realtor directory\" OR \"real estate agent directory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Doctor Directory", value: "\"@\" \"doctor directory\" OR \"physician directory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Lawyer Directory", value: "\"@\" \"lawyer directory\" OR \"attorney directory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Dentist Directory", value: "\"@\" \"dentist directory\" OR \"dental directory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Therapist Directory", value: "\"@\" \"therapist directory\" OR \"counselor directory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Consultant Directory", value: "\"@\" \"consultant directory\" OR \"consulting directory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Directory: Accountant Directory", value: "\"@\" \"accountant directory\" OR \"CPA directory\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── C-Suite & Executive Leadership ──
    { name: "CEO / Chief Executive Officer", value: "\"@\" CEO OR \"chief executive officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "CFO / Chief Financial Officer", value: "\"@\" CFO OR \"chief financial officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "COO / Chief Operating Officer", value: "\"@\" COO OR \"chief operating officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "CTO / Chief Technology Officer", value: "\"@\" CTO OR \"chief technology officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "CMO / Chief Marketing Officer", value: "\"@\" CMO OR \"chief marketing officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "CIO / Chief Information Officer", value: "\"@\" CIO OR \"chief information officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "CHRO / Chief Human Resources Officer", value: "\"@\" CHRO OR \"chief human resources officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "CLO / Chief Legal Officer", value: "\"@\" CLO OR \"chief legal officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "CSO / Chief Security Officer", value: "\"@\" CSO OR \"chief security officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "CDO / Chief Data Officer", value: "\"@\" CDO OR \"chief data officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "CPO / Chief Product Officer", value: "\"@\" CPO OR \"chief product officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "CRO / Chief Revenue Officer", value: "\"@\" CRO OR \"chief revenue officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "President", value: "\"@\" President -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Vice President (VP)", value: "\"@\" \"Vice President\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Managing Director", value: "\"@\" \"Managing Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Executive Director", value: "\"@\" \"Executive Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Board Member / Director", value: "\"@\" \"Board Member\" OR \"Board of Directors\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Partner", value: "\"@\" Partner -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Founder / Co-Founder", value: "\"@\" Founder OR \"Co-Founder\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Owner / Proprietor", value: "\"@\" Owner OR Proprietor -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Senior Management ──
    { name: "Senior Vice President (SVP)", value: "\"@\" \"Senior Vice President\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "General Manager", value: "\"@\" \"General Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Director", value: "\"@\" Director -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Senior Director", value: "\"@\" \"Senior Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Head of Department", value: "\"@\" \"Head of\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Principal", value: "\"@\" Principal -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Sales ──
    { name: "VP of Sales", value: "\"@\" \"VP of Sales\" OR \"Vice President of Sales\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Sales Director", value: "\"@\" \"Sales Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Sales Manager", value: "\"@\" \"Sales Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Regional Sales Manager", value: "\"@\" \"Regional Sales Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Account Executive", value: "\"@\" \"Account Executive\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Account Manager", value: "\"@\" \"Account Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business Development Manager", value: "\"@\" \"Business Development Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business Development Representative", value: "\"@\" \"Business Development Representative\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Sales Representative", value: "\"@\" \"Sales Representative\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Inside Sales", value: "\"@\" \"Inside Sales\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Outside Sales", value: "\"@\" \"Outside Sales\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Sales Engineer", value: "\"@\" \"Sales Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Key Account Manager", value: "\"@\" \"Key Account Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Territory Manager", value: "\"@\" \"Territory Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Marketing ──
    { name: "VP of Marketing", value: "\"@\" \"VP of Marketing\" OR \"Vice President of Marketing\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Marketing Director", value: "\"@\" \"Marketing Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Marketing Manager", value: "\"@\" \"Marketing Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Digital Marketing Manager", value: "\"@\" \"Digital Marketing Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Content Marketing Manager", value: "\"@\" \"Content Marketing Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Brand Manager", value: "\"@\" \"Brand Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Product Marketing Manager", value: "\"@\" \"Product Marketing Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SEO Manager / Specialist", value: "\"@\" \"SEO Manager\" OR \"SEO Specialist\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Social Media Manager", value: "\"@\" \"Social Media Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Communications Manager", value: "\"@\" \"Communications Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Public Relations Manager", value: "\"@\" \"Public Relations Manager\" OR \"PR Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Growth Manager", value: "\"@\" \"Growth Manager\" OR \"Head of Growth\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Demand Generation Manager", value: "\"@\" \"Demand Generation\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Marketing Coordinator", value: "\"@\" \"Marketing Coordinator\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Email Marketing Manager", value: "\"@\" \"Email Marketing\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Information Technology (IT) ──
    { name: "VP of Engineering", value: "\"@\" \"VP of Engineering\" OR \"Vice President of Engineering\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "IT Director", value: "\"@\" \"IT Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "IT Manager", value: "\"@\" \"IT Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Engineering Manager", value: "\"@\" \"Engineering Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Software Engineer", value: "\"@\" \"Software Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Senior Software Engineer", value: "\"@\" \"Senior Software Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Full Stack Developer", value: "\"@\" \"Full Stack Developer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Frontend Developer", value: "\"@\" \"Frontend Developer\" OR \"Front-End Developer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Backend Developer", value: "\"@\" \"Backend Developer\" OR \"Back-End Developer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "DevOps Engineer", value: "\"@\" \"DevOps Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Cloud Engineer / Architect", value: "\"@\" \"Cloud Engineer\" OR \"Cloud Architect\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Data Engineer", value: "\"@\" \"Data Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Data Scientist", value: "\"@\" \"Data Scientist\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Machine Learning Engineer", value: "\"@\" \"Machine Learning Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "AI Engineer", value: "\"@\" \"AI Engineer\" OR \"Artificial Intelligence\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "System Administrator", value: "\"@\" \"System Administrator\" OR \"Sysadmin\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Network Engineer", value: "\"@\" \"Network Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Security Engineer", value: "\"@\" \"Security Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Cybersecurity Analyst", value: "\"@\" \"Cybersecurity Analyst\" OR \"Cybersecurity\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Database Administrator (DBA)", value: "\"@\" \"Database Administrator\" OR DBA -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "QA Engineer / Tester", value: "\"@\" \"QA Engineer\" OR \"Quality Assurance\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Solutions Architect", value: "\"@\" \"Solutions Architect\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Technical Lead", value: "\"@\" \"Technical Lead\" OR \"Tech Lead\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Scrum Master", value: "\"@\" \"Scrum Master\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Product Owner", value: "\"@\" \"Product Owner\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Product Management ──
    { name: "VP of Product", value: "\"@\" \"VP of Product\" OR \"Vice President of Product\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Product Director", value: "\"@\" \"Product Director\" OR \"Director of Product\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Product Manager", value: "\"@\" \"Product Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Senior Product Manager", value: "\"@\" \"Senior Product Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Product Analyst", value: "\"@\" \"Product Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Human Resources (HR) ──
    { name: "VP of Human Resources", value: "\"@\" \"VP of HR\" OR \"VP of Human Resources\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "HR Director", value: "\"@\" \"HR Director\" OR \"Human Resources Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "HR Manager", value: "\"@\" \"HR Manager\" OR \"Human Resources Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Talent Acquisition Manager", value: "\"@\" \"Talent Acquisition Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Recruiter / Senior Recruiter", value: "\"@\" Recruiter OR \"Senior Recruiter\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "HR Business Partner", value: "\"@\" \"HR Business Partner\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Compensation & Benefits Manager", value: "\"@\" \"Compensation\" OR \"Benefits Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Learning & Development Manager", value: "\"@\" \"Learning and Development\" OR \"L&D Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "People Operations Manager", value: "\"@\" \"People Operations\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "HR Generalist", value: "\"@\" \"HR Generalist\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "HR Coordinator", value: "\"@\" \"HR Coordinator\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Finance & Accounting ──
    { name: "VP of Finance", value: "\"@\" \"VP of Finance\" OR \"Vice President of Finance\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Finance Director", value: "\"@\" \"Finance Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Finance Manager", value: "\"@\" \"Finance Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Financial Analyst", value: "\"@\" \"Financial Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Controller / Financial Controller", value: "\"@\" Controller OR \"Financial Controller\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Accounting Manager", value: "\"@\" \"Accounting Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Accountant / CPA", value: "\"@\" Accountant OR CPA -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Auditor", value: "\"@\" Auditor -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Treasurer", value: "\"@\" Treasurer -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Tax Manager / Tax Director", value: "\"@\" \"Tax Manager\" OR \"Tax Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Payroll Manager", value: "\"@\" \"Payroll Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Investment Analyst", value: "\"@\" \"Investment Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Risk Manager", value: "\"@\" \"Risk Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Compliance Officer", value: "\"@\" \"Compliance Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Operations & Logistics ──
    { name: "VP of Operations", value: "\"@\" \"VP of Operations\" OR \"Vice President of Operations\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Operations Director", value: "\"@\" \"Operations Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Operations Manager", value: "\"@\" \"Operations Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Supply Chain Manager", value: "\"@\" \"Supply Chain Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Logistics Manager", value: "\"@\" \"Logistics Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Procurement Manager", value: "\"@\" \"Procurement Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Purchasing Manager", value: "\"@\" \"Purchasing Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Warehouse Manager", value: "\"@\" \"Warehouse Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Facilities Manager", value: "\"@\" \"Facilities Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Project Manager", value: "\"@\" \"Project Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Program Manager", value: "\"@\" \"Program Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business Analyst", value: "\"@\" \"Business Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Process Improvement Manager", value: "\"@\" \"Process Improvement\" OR \"Continuous Improvement\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Legal ──
    { name: "General Counsel", value: "\"@\" \"General Counsel\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Legal Director", value: "\"@\" \"Legal Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Corporate Counsel", value: "\"@\" \"Corporate Counsel\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Attorney / Lawyer", value: "\"@\" Attorney OR Lawyer -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Paralegal", value: "\"@\" Paralegal -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Contract Manager", value: "\"@\" \"Contract Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Intellectual Property (IP) Counsel", value: "\"@\" \"Intellectual Property\" OR \"IP Counsel\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Customer Success & Support ──
    { name: "VP of Customer Success", value: "\"@\" \"VP of Customer Success\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Customer Success Director", value: "\"@\" \"Customer Success Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Customer Success Manager", value: "\"@\" \"Customer Success Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Customer Support Manager", value: "\"@\" \"Customer Support Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Customer Service Manager", value: "\"@\" \"Customer Service Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Technical Support Manager", value: "\"@\" \"Technical Support Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Client Relations Manager", value: "\"@\" \"Client Relations Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Customer Experience Manager", value: "\"@\" \"Customer Experience Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Design & Creative ──
    { name: "Creative Director", value: "\"@\" \"Creative Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Art Director", value: "\"@\" \"Art Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "UX Designer", value: "\"@\" \"UX Designer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "UI Designer", value: "\"@\" \"UI Designer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "UX/UI Designer", value: "\"@\" \"UX/UI Designer\" OR \"UX Designer\" OR \"UI Designer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Graphic Designer", value: "\"@\" \"Graphic Designer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Product Designer", value: "\"@\" \"Product Designer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Design Manager", value: "\"@\" \"Design Manager\" OR \"Head of Design\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "UX Researcher", value: "\"@\" \"UX Researcher\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Healthcare & Medical ──
    { name: "Medical Director", value: "\"@\" \"Medical Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief Medical Officer (CMO)", value: "\"@\" \"Chief Medical Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief Nursing Officer", value: "\"@\" \"Chief Nursing Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Hospital Administrator", value: "\"@\" \"Hospital Administrator\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Physician / Doctor", value: "\"@\" Physician OR Doctor OR MD -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Surgeon", value: "\"@\" Surgeon -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Nurse Manager", value: "\"@\" \"Nurse Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Registered Nurse (RN)", value: "\"@\" \"Registered Nurse\" OR RN -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Pharmacist", value: "\"@\" Pharmacist -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Healthcare Administrator", value: "\"@\" \"Healthcare Administrator\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Clinical Research Manager", value: "\"@\" \"Clinical Research Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Biotech / Pharmaceutical Researcher", value: "\"@\" \"Biotech Researcher\" OR \"Pharmaceutical Researcher\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Health Information Manager", value: "\"@\" \"Health Information Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Dentist", value: "\"@\" Dentist -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Therapist / Counselor", value: "\"@\" Therapist OR Counselor -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Education & Training ──
    { name: "Dean / Associate Dean", value: "\"@\" Dean OR \"Associate Dean\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Professor", value: "\"@\" Professor -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "School Principal", value: "\"@\" \"School Principal\" OR Principal -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Teacher / Educator", value: "\"@\" Teacher OR Educator -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Training Manager", value: "\"@\" \"Training Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Academic Director", value: "\"@\" \"Academic Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Curriculum Developer", value: "\"@\" \"Curriculum Developer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Instructional Designer", value: "\"@\" \"Instructional Designer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Education Administrator", value: "\"@\" \"Education Administrator\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Engineering & Manufacturing ──
    { name: "Engineering Director", value: "\"@\" \"Engineering Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Mechanical Engineer", value: "\"@\" \"Mechanical Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Electrical Engineer", value: "\"@\" \"Electrical Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Civil Engineer", value: "\"@\" \"Civil Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chemical Engineer", value: "\"@\" \"Chemical Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Industrial Engineer", value: "\"@\" \"Industrial Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Manufacturing Manager", value: "\"@\" \"Manufacturing Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Plant Manager", value: "\"@\" \"Plant Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Production Manager", value: "\"@\" \"Production Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Quality Manager", value: "\"@\" \"Quality Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Quality Assurance Manager", value: "\"@\" \"Quality Assurance Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Environmental Engineer", value: "\"@\" \"Environmental Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Safety Manager", value: "\"@\" \"Safety Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Real Estate & Construction ──
    { name: "Real Estate Agent / Broker", value: "\"@\" \"Real Estate Agent\" OR \"Real Estate Broker\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Real Estate Developer", value: "\"@\" \"Real Estate Developer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Property Manager", value: "\"@\" \"Property Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Construction Manager", value: "\"@\" \"Construction Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Project Engineer (Construction)", value: "\"@\" \"Project Engineer\" construction -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Architect", value: "\"@\" Architect -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Consulting & Professional Services ──
    { name: "Management Consultant", value: "\"@\" \"Management Consultant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Strategy Consultant", value: "\"@\" \"Strategy Consultant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Senior Consultant", value: "\"@\" \"Senior Consultant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Principal Consultant", value: "\"@\" \"Principal Consultant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business Consultant", value: "\"@\" \"Business Consultant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "IT Consultant", value: "\"@\" \"IT Consultant\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Media, Advertising & Entertainment ──
    { name: "Media Director", value: "\"@\" \"Media Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Advertising Director", value: "\"@\" \"Advertising Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Editor / Editor-in-Chief", value: "\"@\" Editor OR \"Editor-in-Chief\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Journalist / Reporter", value: "\"@\" Journalist OR Reporter -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Content Creator", value: "\"@\" \"Content Creator\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Producer", value: "\"@\" Producer -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Copywriter", value: "\"@\" Copywriter -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Nonprofit & Government ──
    { name: "Executive Director (Nonprofit)", value: "\"@\" \"Executive Director\" nonprofit -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Program Director (Nonprofit)", value: "\"@\" \"Program Director\" nonprofit -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Fundraising Manager", value: "\"@\" \"Fundraising Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Grant Writer", value: "\"@\" \"Grant Writer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Policy Analyst", value: "\"@\" \"Policy Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Government Relations", value: "\"@\" \"Government Relations\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Research & Science ──
    { name: "Research Director", value: "\"@\" \"Research Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Research Scientist", value: "\"@\" \"Research Scientist\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "R&D Manager", value: "\"@\" \"R&D Manager\" OR \"Research and Development\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Lab Manager", value: "\"@\" \"Lab Manager\" OR \"Laboratory Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Scientist", value: "\"@\" Scientist -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Retail & E-Commerce ──
    { name: "Retail Manager", value: "\"@\" \"Retail Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Store Manager", value: "\"@\" \"Store Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "E-Commerce Manager", value: "\"@\" \"E-Commerce Manager\" OR \"Ecommerce Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Merchandising Manager", value: "\"@\" \"Merchandising Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Buyer / Category Manager", value: "\"@\" Buyer OR \"Category Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Visual Merchandiser", value: "\"@\" \"Visual Merchandiser\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Insurance & Banking ──
    { name: "Insurance Agent / Broker", value: "\"@\" \"Insurance Agent\" OR \"Insurance Broker\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Underwriter", value: "\"@\" Underwriter -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Claims Manager", value: "\"@\" \"Claims Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Actuary", value: "\"@\" Actuary -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Bank Manager", value: "\"@\" \"Bank Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Loan Officer", value: "\"@\" \"Loan Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Wealth Manager / Financial Advisor", value: "\"@\" \"Wealth Manager\" OR \"Financial Advisor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Portfolio Manager", value: "\"@\" \"Portfolio Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Transportation & Automotive ──
    { name: "Fleet Manager", value: "\"@\" \"Fleet Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Transportation Manager", value: "\"@\" \"Transportation Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Automotive Manager", value: "\"@\" \"Automotive Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Dealership Manager", value: "\"@\" \"Dealership Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Energy & Utilities ──
    { name: "Energy Manager", value: "\"@\" \"Energy Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Utility Manager", value: "\"@\" \"Utility Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Renewable Energy Manager", value: "\"@\" \"Renewable Energy\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Petroleum Engineer", value: "\"@\" \"Petroleum Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Power Plant Manager", value: "\"@\" \"Power Plant Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Hospitality & Travel ──
    { name: "Hotel Manager / General Manager", value: "\"@\" \"Hotel Manager\" OR \"Hotel General Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Restaurant Manager", value: "\"@\" \"Restaurant Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Food & Beverage Manager", value: "\"@\" \"Food and Beverage Manager\" OR \"F&B Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Event Manager / Planner", value: "\"@\" \"Event Manager\" OR \"Event Planner\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Travel Manager", value: "\"@\" \"Travel Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chef / Executive Chef", value: "\"@\" Chef OR \"Executive Chef\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Agriculture & Environment ──
    { name: "Farm Manager", value: "\"@\" \"Farm Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Agricultural Manager", value: "\"@\" \"Agricultural Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Environmental Manager", value: "\"@\" \"Environmental Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Sustainability Manager", value: "\"@\" \"Sustainability Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Telecommunications ──
    { name: "Telecom Manager", value: "\"@\" \"Telecom Manager\" OR \"Telecommunications Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Network Operations Manager", value: "\"@\" \"Network Operations Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "RF Engineer", value: "\"@\" \"RF Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Sports & Fitness ──
    { name: "Athletic Director", value: "\"@\" \"Athletic Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Sports Manager", value: "\"@\" \"Sports Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Fitness Director", value: "\"@\" \"Fitness Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Coach / Head Coach", value: "\"@\" Coach OR \"Head Coach\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ══════════════════════════════════════════════
    // Apollo.io-Style Seniority, Departments & Industries
    // ══════════════════════════════════════════════

    // ── Seniority: Entry & Associate ──
    { name: "Intern", value: "\"@\" Intern -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Associate", value: "\"@\" Associate -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Analyst", value: "\"@\" Analyst -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Junior Developer", value: "\"@\" \"Junior Developer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Coordinator", value: "\"@\" Coordinator -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Assistant", value: "\"@\" Assistant -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Specialist", value: "\"@\" Specialist -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Technician", value: "\"@\" Technician -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Representative", value: "\"@\" Representative -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Administrator", value: "\"@\" Administrator -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Clerk", value: "\"@\" Clerk -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Apprentice", value: "\"@\" Apprentice -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Seniority: Senior & Staff ──
    { name: "Staff Engineer", value: "\"@\" \"Staff Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Senior Manager", value: "\"@\" \"Senior Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Lead", value: "\"@\" Lead -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Team Lead", value: "\"@\" \"Team Lead\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Supervisor", value: "\"@\" Supervisor -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Senior Analyst", value: "\"@\" \"Senior Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Senior Associate", value: "\"@\" \"Senior Associate\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Senior Specialist", value: "\"@\" \"Senior Specialist\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Seniority: Executive Variations ──
    { name: "Chief Compliance Officer (CCO)", value: "\"@\" \"Chief Compliance Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief Strategy Officer", value: "\"@\" \"Chief Strategy Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief Growth Officer", value: "\"@\" \"Chief Growth Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief People Officer", value: "\"@\" \"Chief People Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief Communications Officer", value: "\"@\" \"Chief Communications Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief Innovation Officer", value: "\"@\" \"Chief Innovation Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief Sustainability Officer", value: "\"@\" \"Chief Sustainability Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief Experience Officer", value: "\"@\" \"Chief Experience Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief Digital Officer", value: "\"@\" \"Chief Digital Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief Analytics Officer", value: "\"@\" \"Chief Analytics Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief Procurement Officer", value: "\"@\" \"Chief Procurement Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief Investment Officer", value: "\"@\" \"Chief Investment Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief Architect", value: "\"@\" \"Chief Architect\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief Scientist", value: "\"@\" \"Chief Scientist\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Chief Evangelist", value: "\"@\" \"Chief Evangelist\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Department: Data Science & Analytics ──
    { name: "Head of Data", value: "\"@\" \"Head of Data\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Director of Analytics", value: "\"@\" \"Director of Analytics\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Analytics Manager", value: "\"@\" \"Analytics Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Data Analyst", value: "\"@\" \"Data Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Senior Data Analyst", value: "\"@\" \"Senior Data Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business Intelligence Analyst", value: "\"@\" \"Business Intelligence Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "BI Developer", value: "\"@\" \"BI Developer\" OR \"Business Intelligence Developer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Data Architect", value: "\"@\" \"Data Architect\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Statistician", value: "\"@\" Statistician -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Quantitative Analyst", value: "\"@\" \"Quantitative Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Department: Revenue Operations ──
    { name: "VP of Revenue Operations", value: "\"@\" \"VP of Revenue Operations\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Revenue Operations Manager", value: "\"@\" \"Revenue Operations Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Sales Operations Manager", value: "\"@\" \"Sales Operations Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Marketing Operations Manager", value: "\"@\" \"Marketing Operations Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "GTM Strategist", value: "\"@\" \"Go-To-Market\" OR \"GTM\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Department: Partnerships & Alliances ──
    { name: "VP of Partnerships", value: "\"@\" \"VP of Partnerships\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Director of Partnerships", value: "\"@\" \"Director of Partnerships\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Partnerships Manager", value: "\"@\" \"Partnerships Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Channel Manager", value: "\"@\" \"Channel Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Alliance Manager", value: "\"@\" \"Alliance Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Strategic Partnerships", value: "\"@\" \"Strategic Partnerships\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Department: Developer Relations ──
    { name: "Developer Advocate", value: "\"@\" \"Developer Advocate\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Developer Relations Manager", value: "\"@\" \"Developer Relations\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Technical Evangelist", value: "\"@\" \"Technical Evangelist\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Developer Experience Engineer", value: "\"@\" \"Developer Experience\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Community Manager (Tech)", value: "\"@\" \"Community Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Department: Information Security ──
    { name: "CISO / Chief Information Security Officer", value: "\"@\" CISO OR \"Chief Information Security Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "VP of Information Security", value: "\"@\" \"VP of Information Security\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Information Security Manager", value: "\"@\" \"Information Security Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Security Architect", value: "\"@\" \"Security Architect\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Penetration Tester", value: "\"@\" \"Penetration Tester\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC Analyst", value: "\"@\" \"SOC Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "GRC Analyst", value: "\"@\" \"GRC Analyst\" OR \"Governance Risk Compliance\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Threat Intelligence Analyst", value: "\"@\" \"Threat Intelligence\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Department: Corporate Development & Strategy ──
    { name: "VP of Corporate Development", value: "\"@\" \"VP of Corporate Development\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Corporate Development Manager", value: "\"@\" \"Corporate Development\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "M&A Analyst", value: "\"@\" \"M&A\" OR \"Mergers and Acquisitions\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Strategy Director", value: "\"@\" \"Strategy Director\" OR \"Director of Strategy\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Strategy Manager", value: "\"@\" \"Strategy Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Corporate Strategy Analyst", value: "\"@\" \"Corporate Strategy\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Department: Investor Relations ──
    { name: "VP of Investor Relations", value: "\"@\" \"VP of Investor Relations\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Investor Relations Manager", value: "\"@\" \"Investor Relations Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Investor Relations Director", value: "\"@\" \"Investor Relations Director\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Department: Enterprise Architecture ──
    { name: "Enterprise Architect", value: "\"@\" \"Enterprise Architect\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "IT Architect", value: "\"@\" \"IT Architect\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Application Architect", value: "\"@\" \"Application Architect\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Infrastructure Architect", value: "\"@\" \"Infrastructure Architect\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Department: ERP & Business Systems ──
    { name: "ERP Manager", value: "\"@\" \"ERP Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SAP Consultant", value: "\"@\" \"SAP Consultant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Salesforce Administrator", value: "\"@\" \"Salesforce Administrator\" OR \"Salesforce Admin\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "CRM Manager", value: "\"@\" \"CRM Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Department: Supply Chain & Sourcing ──
    { name: "VP of Supply Chain", value: "\"@\" \"VP of Supply Chain\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Supply Chain Director", value: "\"@\" \"Supply Chain Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Supply Chain Analyst", value: "\"@\" \"Supply Chain Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Sourcing Manager", value: "\"@\" \"Sourcing Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Strategic Sourcing Manager", value: "\"@\" \"Strategic Sourcing\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Vendor Manager", value: "\"@\" \"Vendor Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Inventory Manager", value: "\"@\" \"Inventory Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Distribution Manager", value: "\"@\" \"Distribution Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Department: Diversity, Equity & Inclusion ──
    { name: "Chief Diversity Officer", value: "\"@\" \"Chief Diversity Officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "VP of Diversity & Inclusion", value: "\"@\" \"VP of Diversity\" OR \"VP of Inclusion\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "DE&I Manager", value: "\"@\" \"Diversity\" \"Inclusion\" Manager -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Department: Workplace & Office ──
    { name: "Office Manager", value: "\"@\" \"Office Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Workplace Manager", value: "\"@\" \"Workplace Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Executive Assistant", value: "\"@\" \"Executive Assistant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Administrative Manager", value: "\"@\" \"Administrative Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Receptionist", value: "\"@\" Receptionist -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: SaaS & Software ──
    { name: "SaaS Sales", value: "\"@\" SaaS Sales -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SaaS Account Executive", value: "\"@\" SaaS \"Account Executive\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SaaS Product Manager", value: "\"@\" SaaS \"Product Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SaaS Customer Success", value: "\"@\" SaaS \"Customer Success\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Software Company - CEO", value: "\"@\" CEO software -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Software Company - CTO", value: "\"@\" CTO software -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Software Company - VP Sales", value: "\"@\" \"VP of Sales\" software -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: Fintech ──
    { name: "Fintech CEO", value: "\"@\" CEO fintech -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Fintech Product Manager", value: "\"@\" \"Product Manager\" fintech -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Fintech Engineer", value: "\"@\" engineer fintech -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Payments Manager", value: "\"@\" \"Payments Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Blockchain Developer", value: "\"@\" \"Blockchain Developer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Crypto / Web3 Manager", value: "\"@\" \"Crypto\" OR \"Web3\" Manager -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: Healthtech & Biotech ──
    { name: "Healthtech CEO", value: "\"@\" CEO healthtech OR \"health tech\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Healthtech Product Manager", value: "\"@\" \"Product Manager\" healthtech OR \"health tech\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Bioinformatics Scientist", value: "\"@\" \"Bioinformatics Scientist\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Clinical Operations Director", value: "\"@\" \"Clinical Operations Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Regulatory Affairs Manager", value: "\"@\" \"Regulatory Affairs Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Medical Science Liaison", value: "\"@\" \"Medical Science Liaison\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Pharmaceutical Sales Rep", value: "\"@\" \"Pharmaceutical Sales\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: EdTech ──
    { name: "EdTech CEO / Founder", value: "\"@\" CEO OR Founder edtech OR \"ed tech\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "EdTech Product Manager", value: "\"@\" \"Product Manager\" edtech -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "EdTech Sales", value: "\"@\" Sales edtech OR \"education technology\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: CleanTech & Renewable Energy ──
    { name: "CleanTech CEO", value: "\"@\" CEO cleantech OR \"clean tech\" OR \"clean energy\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Solar Energy Manager", value: "\"@\" \"Solar Energy Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Wind Energy Engineer", value: "\"@\" \"Wind Energy Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Sustainability Director", value: "\"@\" \"Sustainability Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "ESG Manager", value: "\"@\" \"ESG Manager\" OR \"ESG Director\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: Aerospace & Defense ──
    { name: "Aerospace Engineer", value: "\"@\" \"Aerospace Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Defense Program Manager", value: "\"@\" \"Program Manager\" defense -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Avionics Engineer", value: "\"@\" \"Avionics Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Space Systems Engineer", value: "\"@\" \"Space Systems Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: Cybersecurity ──
    { name: "Cybersecurity Director", value: "\"@\" \"Cybersecurity Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Cybersecurity Engineer", value: "\"@\" \"Cybersecurity Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Cybersecurity Consultant", value: "\"@\" \"Cybersecurity Consultant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Application Security Engineer", value: "\"@\" \"Application Security Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Security Operations Manager", value: "\"@\" \"Security Operations Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: AI & Machine Learning ──
    { name: "AI Research Scientist", value: "\"@\" \"AI Research Scientist\" OR \"AI Researcher\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NLP Engineer", value: "\"@\" \"NLP Engineer\" OR \"Natural Language Processing\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Computer Vision Engineer", value: "\"@\" \"Computer Vision Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "ML Ops Engineer", value: "\"@\" \"MLOps\" OR \"ML Ops\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Deep Learning Engineer", value: "\"@\" \"Deep Learning Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "AI Product Manager", value: "\"@\" \"AI Product Manager\" OR \"AI\" \"Product Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: Cloud & Infrastructure ──
    { name: "AWS Solutions Architect", value: "\"@\" \"AWS\" \"Solutions Architect\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Azure Architect", value: "\"@\" \"Azure\" Architect -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "GCP Engineer", value: "\"@\" \"GCP\" OR \"Google Cloud\" Engineer -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Site Reliability Engineer (SRE)", value: "\"@\" \"Site Reliability Engineer\" OR SRE -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Platform Engineer", value: "\"@\" \"Platform Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Infrastructure Engineer", value: "\"@\" \"Infrastructure Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: E-Commerce & Marketplace ──
    { name: "E-Commerce Director", value: "\"@\" \"E-Commerce Director\" OR \"Ecommerce Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Marketplace Manager", value: "\"@\" \"Marketplace Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "E-Commerce Product Manager", value: "\"@\" \"E-Commerce\" OR \"Ecommerce\" \"Product Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Fulfillment Manager", value: "\"@\" \"Fulfillment Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Amazon Seller / Vendor Manager", value: "\"@\" Amazon \"Vendor Manager\" OR \"Seller Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: Gaming & Entertainment ──
    { name: "Game Designer", value: "\"@\" \"Game Designer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Game Developer / Programmer", value: "\"@\" \"Game Developer\" OR \"Game Programmer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Game Producer", value: "\"@\" \"Game Producer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Level Designer", value: "\"@\" \"Level Designer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "QA Tester (Gaming)", value: "\"@\" \"QA Tester\" gaming -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: Semiconductor & Hardware ──
    { name: "Chip Design Engineer", value: "\"@\" \"Chip Design Engineer\" OR \"IC Design\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Hardware Engineer", value: "\"@\" \"Hardware Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Embedded Systems Engineer", value: "\"@\" \"Embedded Systems Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "FPGA Engineer", value: "\"@\" \"FPGA Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Semiconductor Process Engineer", value: "\"@\" \"Process Engineer\" semiconductor -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: IoT & Robotics ──
    { name: "IoT Engineer", value: "\"@\" \"IoT Engineer\" OR \"Internet of Things\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "IoT Product Manager", value: "\"@\" \"IoT\" \"Product Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Robotics Engineer", value: "\"@\" \"Robotics Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Automation Engineer", value: "\"@\" \"Automation Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Controls Engineer", value: "\"@\" \"Controls Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: Fashion & Apparel ──
    { name: "Fashion Designer", value: "\"@\" \"Fashion Designer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Fashion Buyer", value: "\"@\" \"Fashion Buyer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Fashion Merchandiser", value: "\"@\" \"Fashion Merchandiser\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Apparel Product Manager", value: "\"@\" \"Apparel\" \"Product Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Textile Engineer", value: "\"@\" \"Textile Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: Food & Beverage ──
    { name: "Food Scientist", value: "\"@\" \"Food Scientist\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Food Safety Manager", value: "\"@\" \"Food Safety Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Beverage Director", value: "\"@\" \"Beverage Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Supply Chain Manager (F&B)", value: "\"@\" \"Supply Chain Manager\" food OR beverage -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: Mining & Natural Resources ──
    { name: "Mining Engineer", value: "\"@\" \"Mining Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Geologist", value: "\"@\" Geologist -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Mine Manager", value: "\"@\" \"Mine Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Exploration Manager", value: "\"@\" \"Exploration Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: Maritime & Shipping ──
    { name: "Maritime Manager", value: "\"@\" \"Maritime Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Shipping Manager", value: "\"@\" \"Shipping Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Port Manager", value: "\"@\" \"Port Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Marine Engineer", value: "\"@\" \"Marine Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: Pharmaceuticals ──
    { name: "Pharmaceutical Director", value: "\"@\" \"Pharmaceutical Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Drug Development Manager", value: "\"@\" \"Drug Development Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Pharmacovigilance Manager", value: "\"@\" \"Pharmacovigilance Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Clinical Trial Manager", value: "\"@\" \"Clinical Trial Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Medical Affairs Director", value: "\"@\" \"Medical Affairs Director\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Industry: AR / VR / 3D ──
    { name: "AR/VR Developer", value: "\"@\" \"AR\" OR \"VR\" OR \"Augmented Reality\" OR \"Virtual Reality\" developer -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "3D Artist / Modeler", value: "\"@\" \"3D Artist\" OR \"3D Modeler\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "XR Product Manager", value: "\"@\" \"XR\" OR \"Extended Reality\" \"Product Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Blockchain / Crypto / Web3 ──
    { name: "Blockchain / Smart Contract Developer", value: "\"@\" \"Blockchain Developer\" OR \"Smart Contract Developer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Crypto Analyst", value: "\"@\" \"Crypto Analyst\" OR \"Cryptocurrency Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Web3 Developer", value: "\"@\" \"Web3 Developer\" OR \"DeFi Developer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Tokenomics Specialist", value: "\"@\" \"Tokenomics\" OR \"Token Economics\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NFT Project Manager", value: "\"@\" \"NFT\" \"Project Manager\" OR \"NFT Lead\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Head of Crypto / Blockchain", value: "\"@\" \"Head of\" crypto OR blockchain -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── LegalTech ──
    { name: "LegalTech Product Manager", value: "\"@\" \"LegalTech\" OR \"Legal Technology\" \"Product Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Legal Operations Manager", value: "\"@\" \"Legal Operations Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "E-Discovery Specialist", value: "\"@\" \"eDiscovery\" OR \"E-Discovery\" specialist -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Contract Manager / Analyst", value: "\"@\" \"Contract Manager\" OR \"Contract Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Compliance Technology Lead", value: "\"@\" \"Compliance\" technology OR \"RegTech\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── PropTech / Real Estate Tech ──
    { name: "PropTech Founder / CEO", value: "\"@\" \"PropTech\" OR \"Property Technology\" CEO OR Founder -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Real Estate Technology Manager", value: "\"@\" \"Real Estate\" technology manager -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Property Management Director", value: "\"@\" \"Property Management\" Director -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── InsurTech ──
    { name: "InsurTech Product Manager", value: "\"@\" \"InsurTech\" OR \"Insurance Technology\" \"Product Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Actuarial Data Scientist", value: "\"@\" \"Actuarial\" OR \"Actuary\" \"Data Scientist\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Insurance Underwriting Manager", value: "\"@\" \"Underwriting Manager\" insurance -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Additional Roles Across Industries ──
    { name: "Senior Project Manager", value: "\"@\" \"Senior Project Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Senior Program Manager", value: "\"@\" \"Senior Program Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Senior Business Analyst", value: "\"@\" \"Senior Business Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Senior Financial Analyst", value: "\"@\" \"Senior Financial Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Marketing Analyst", value: "\"@\" \"Marketing Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Operations Analyst", value: "\"@\" \"Operations Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Sales Coordinator", value: "\"@\" \"Sales Coordinator\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Administrative Assistant", value: "\"@\" \"Administrative Assistant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Receptionist / Front Desk", value: "\"@\" Receptionist OR \"Front Desk\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Training Manager / Coordinator", value: "\"@\" \"Training Manager\" OR \"Training Coordinator\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Internal Auditor", value: "\"@\" \"Internal Auditor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Controller / Comptroller", value: "\"@\" Controller OR Comptroller -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Logistics Coordinator", value: "\"@\" \"Logistics Coordinator\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Communications Director", value: "\"@\" \"Communications Director\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Scrum Master / Agile Coach", value: "\"@\" \"Scrum Master\" OR \"Agile Coach\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "DevOps Lead", value: "\"@\" \"DevOps\" Lead OR Manager -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Cloud Architect", value: "\"@\" \"Cloud Architect\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Technical Writer", value: "\"@\" \"Technical Writer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Content Writer / Copywriter", value: "\"@\" \"Content Writer\" OR Copywriter -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Talent Acquisition Lead", value: "\"@\" \"Talent Acquisition\" lead OR manager -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "EHS / Safety Manager", value: "\"@\" \"EHS Manager\" OR \"Safety Manager\" OR \"Health and Safety\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ══════════════════════════════════════════════
    // Self-Employed / Freelancer / Individual
    // ══════════════════════════════════════════════

    // ── Freelancers & Independent Professionals ──
    { name: "Freelance Web Developer", value: "\"@\" Freelance \"Web Developer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Software Developer", value: "\"@\" Freelance \"Software Developer\" OR \"Software Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Graphic Designer", value: "\"@\" Freelance \"Graphic Designer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance UX/UI Designer", value: "\"@\" Freelance \"UX Designer\" OR \"UI Designer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Writer / Author", value: "\"@\" Freelance Writer OR Author -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Copywriter", value: "\"@\" Freelance Copywriter -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Editor / Proofreader", value: "\"@\" Freelance Editor OR Proofreader -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Photographer", value: "\"@\" Freelance Photographer -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Videographer", value: "\"@\" Freelance Videographer OR \"Video Editor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Social Media Manager", value: "\"@\" Freelance \"Social Media Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance SEO Specialist", value: "\"@\" Freelance \"SEO\" specialist OR consultant -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Digital Marketing", value: "\"@\" Freelance \"Digital Marketing\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Data Scientist", value: "\"@\" Freelance \"Data Scientist\" OR \"Data Analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Bookkeeper / Accountant", value: "\"@\" Freelance Bookkeeper OR Accountant -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Virtual Assistant", value: "\"@\" Freelance \"Virtual Assistant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Translator / Interpreter", value: "\"@\" Freelance Translator OR Interpreter -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Illustrator", value: "\"@\" Freelance Illustrator -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Motion Designer", value: "\"@\" Freelance \"Motion Designer\" OR \"Motion Graphics\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Voice Actor", value: "\"@\" Freelance \"Voice Actor\" OR \"Voice Over\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Freelance Music Producer", value: "\"@\" Freelance \"Music Producer\" OR \"Audio Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Consultants & Advisors ──
    { name: "Independent Consultant", value: "\"@\" \"Independent Consultant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Management Consultant (Independent)", value: "\"@\" \"Management Consultant\" independent OR freelance OR self-employed -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Strategy Consultant (Independent)", value: "\"@\" \"Strategy Consultant\" independent OR freelance -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "IT Consultant (Independent)", value: "\"@\" \"IT Consultant\" independent OR freelance -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Marketing Consultant (Independent)", value: "\"@\" \"Marketing Consultant\" independent OR freelance -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Financial Advisor (Independent)", value: "\"@\" \"Financial Advisor\" OR \"Financial Planner\" independent -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Tax Consultant / CPA (Self-Employed)", value: "\"@\" \"Tax Consultant\" OR CPA self-employed OR independent -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "HR Consultant (Independent)", value: "\"@\" \"HR Consultant\" independent OR freelance -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business Coach / Mentor", value: "\"@\" \"Business Coach\" OR \"Business Mentor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Executive Coach", value: "\"@\" \"Executive Coach\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Life Coach", value: "\"@\" \"Life Coach\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Career Coach / Counselor", value: "\"@\" \"Career Coach\" OR \"Career Counselor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Startup Advisor / Mentor", value: "\"@\" \"Startup Advisor\" OR \"Startup Mentor\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Solopreneurs & Small Business ──
    { name: "Solopreneur / Solo Founder", value: "\"@\" Solopreneur OR \"Solo Founder\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Self-Employed Entrepreneur", value: "\"@\" \"Self-Employed\" Entrepreneur -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Small Business Owner", value: "\"@\" \"Small Business Owner\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Startup Founder (Solo)", value: "\"@\" Founder \"Startup\" self-employed OR independent -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "E-Commerce Entrepreneur", value: "\"@\" \"E-Commerce\" OR Ecommerce Entrepreneur OR Owner -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Amazon / Etsy Seller", value: "\"@\" Amazon OR Etsy Seller OR Owner -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Dropshipping Business Owner", value: "\"@\" Dropshipping Owner OR Entrepreneur -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Gig Workers & Contractors ──
    { name: "Independent Contractor", value: "\"@\" \"Independent Contractor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Contract Software Developer", value: "\"@\" Contract \"Software Developer\" OR \"Software Engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Contract Project Manager", value: "\"@\" Contract \"Project Manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Contract Technical Writer", value: "\"@\" Contract \"Technical Writer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Contract Designer", value: "\"@\" Contract Designer -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Gig Economy / On-Demand Worker", value: "\"@\" \"Gig Economy\" OR \"On-Demand\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Creative & Personal Brand ──
    { name: "Content Creator / Influencer", value: "\"@\" \"Content Creator\" OR Influencer OR YouTuber -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Podcaster / Podcast Host", value: "\"@\" Podcaster OR \"Podcast Host\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Blogger / Online Publisher", value: "\"@\" Blogger OR \"Online Publisher\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Online Course Creator", value: "\"@\" \"Course Creator\" OR \"Online Instructor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Digital Nomad", value: "\"@\" \"Digital Nomad\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Public Speaker / Keynote Speaker", value: "\"@\" \"Public Speaker\" OR \"Keynote Speaker\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Author / Published Writer", value: "\"@\" Author OR \"Published Writer\" -\"@gmail.com\" -\"@yahoo.com\"" },

    // ── Self-Employed Trades & Services ──
    { name: "Self-Employed Realtor / Agent", value: "\"@\" \"Real Estate Agent\" OR Realtor self-employed OR independent -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Self-Employed Insurance Agent", value: "\"@\" \"Insurance Agent\" self-employed OR independent -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Self-Employed Attorney / Lawyer", value: "\"@\" Attorney OR Lawyer \"solo practice\" OR self-employed OR independent -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Self-Employed Dentist / Doctor", value: "\"@\" Dentist OR Doctor OR Physician \"private practice\" OR self-employed -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Self-Employed Therapist / Counselor", value: "\"@\" Therapist OR Counselor \"private practice\" OR self-employed -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Self-Employed Personal Trainer", value: "\"@\" \"Personal Trainer\" OR \"Fitness Trainer\" self-employed OR independent -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Self-Employed Tutor / Educator", value: "\"@\" Tutor OR Educator self-employed OR independent -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Self-Employed Handyman / Contractor", value: "\"@\" Handyman OR Contractor self-employed OR independent -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Self-Employed Chef / Caterer", value: "\"@\" Chef OR Caterer self-employed OR independent -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Self-Employed Event Planner", value: "\"@\" \"Event Planner\" self-employed OR independent OR freelance -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Self-Employed Interior Designer", value: "\"@\" \"Interior Designer\" self-employed OR independent OR freelance -\"@gmail.com\" -\"@yahoo.com\"" },

    // ══════════════════════════════════════════════
    // Office 365 / Microsoft 365 Email Discovery
    // ══════════════════════════════════════════════

    // ── Office 365 Business Email Footprints ──
    { name: "O365: Business emails (onmicrosoft)", value: "\"@\" \"onmicrosoft.com\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "O365: Company contacts (outlook hosted)", value: "\"@\" \"mail.protection.outlook.com\" -\"@outlook.com\" -\"@hotmail.com\"" },
    { name: "O365: Business directory emails", value: "\"@\" \"contact\" OR \"directory\" -\"@gmail.com\" -\"@yahoo.com\" -\"@outlook.com\" -\"@hotmail.com\"" },
    { name: "O365: CEO contact (business domain)", value: "CEO \"@\" -\"@gmail.com\" -\"@yahoo.com\" -\"@outlook.com\" -\"@hotmail.com\" -\"@aol.com\"" },
    { name: "O365: Staff directory (business domain)", value: "\"staff directory\" OR \"our team\" OR \"leadership\" \"@\" -\"@gmail.com\" -\"@yahoo.com\" -\"@outlook.com\"" },
    { name: "O365: Company info page emails", value: "\"info@\" OR \"contact@\" OR \"sales@\" -\"@gmail.com\" -\"@yahoo.com\" -\"@outlook.com\" -\"@hotmail.com\"" },

    // ── Google Workspace Email Footprints ──
    { name: "GWS: Business emails (Google-hosted)", value: "\"@\" -\"@gmail.com\" -\"@yahoo.com\" -\"@hotmail.com\" \"Google Workspace\" OR \"G Suite\"" },
    { name: "GWS: Company domain contacts", value: "\"@\" \"contact us\" -\"@gmail.com\" -\"@yahoo.com\" -\"@outlook.com\" -\"@hotmail.com\" -\"@aol.com\"" },

    // ══════════════════════════════════════════════
    // ISP Email Domain Footprints
    // ══════════════════════════════════════════════

    // ── ISP / Webmail Emails ──
    { name: "ISP: Gmail contacts", value: "\"@gmail.com\"" },
    { name: "ISP: Yahoo contacts", value: "\"@yahoo.com\"" },
    { name: "ISP: Outlook contacts", value: "\"@outlook.com\"" },
    { name: "ISP: Hotmail contacts", value: "\"@hotmail.com\"" },
    { name: "ISP: AOL contacts", value: "\"@aol.com\"" },
    { name: "ISP: iCloud contacts", value: "\"@icloud.com\"" },
    { name: "ISP: ProtonMail contacts", value: "\"@protonmail.com\" OR \"@proton.me\"" },
    { name: "ISP: Zoho contacts", value: "\"@zoho.com\"" },
    { name: "ISP: Mail.com contacts", value: "\"@mail.com\"" },
    { name: "ISP: GMX contacts", value: "\"@gmx.com\" OR \"@gmx.net\"" },
    { name: "ISP: Yandex contacts", value: "\"@yandex.com\" OR \"@yandex.ru\"" },
    { name: "ISP: Comcast / Xfinity contacts", value: "\"@comcast.net\" OR \"@xfinity.com\"" },
    { name: "ISP: BellSouth contacts", value: "\"@bellsouth.net\"" },
    { name: "ISP: AT&T contacts", value: "\"@att.net\" OR \"@sbcglobal.net\"" },
    { name: "ISP: Verizon contacts", value: "\"@verizon.net\"" },
    { name: "ISP: Cox contacts", value: "\"@cox.net\"" },
    { name: "ISP: Charter/Spectrum contacts", value: "\"@charter.net\" OR \"@spectrum.net\"" },
    { name: "ISP: CenturyLink / Lumen contacts", value: "\"@centurylink.net\" OR \"@embarqmail.com\"" },
    { name: "ISP: Frontier contacts", value: "\"@frontier.com\" OR \"@frontiernet.net\"" },
    { name: "ISP: Windstream contacts", value: "\"@windstream.net\"" },
    { name: "ISP: EarthLink contacts", value: "\"@earthlink.net\"" },
    { name: "ISP: Optimum / Cablevision contacts", value: "\"@optonline.net\"" },
    { name: "ISP: RCN contacts", value: "\"@rcn.com\"" },
    { name: "ISP: Suddenlink contacts", value: "\"@suddenlink.net\"" },
    { name: "ISP: WOW contacts", value: "\"@wowway.com\"" },
    { name: "ISP: Mediacom contacts", value: "\"@mediacombb.net\"" },
    { name: "ISP: BT contacts (UK)", value: "\"@btinternet.com\"" },
    { name: "ISP: Virgin Media (UK)", value: "\"@virginmedia.com\"" },
    { name: "ISP: Sky contacts (UK)", value: "\"@sky.com\"" },
    { name: "ISP: TalkTalk (UK)", value: "\"@talktalk.net\"" },
    { name: "ISP: Telstra contacts (AU)", value: "\"@bigpond.com\"" },
    { name: "ISP: Optus contacts (AU)", value: "\"@optusnet.com.au\"" },
    { name: "ISP: Rogers contacts (CA)", value: "\"@rogers.com\"" },
    { name: "ISP: Shaw contacts (CA)", value: "\"@shaw.ca\"" },
    { name: "ISP: Bell Canada contacts", value: "\"@bell.net\" OR \"@sympatico.ca\"" },
    { name: "ISP: Telus contacts (CA)", value: "\"@telus.net\"" },
    { name: "ISP: All major ISP emails", value: "\"@gmail.com\" OR \"@yahoo.com\" OR \"@outlook.com\" OR \"@hotmail.com\" OR \"@aol.com\" OR \"@comcast.net\" OR \"@bellsouth.net\" OR \"@att.net\" OR \"@verizon.net\"" },

    // ══════════════════════════════════════════════
    // Business / Company Email Footprints
    // ══════════════════════════════════════════════

    // ── Business Email Patterns ──
    { name: "Business: Company emails (exclude ISP)", value: "\"@\" -\"@gmail.com\" -\"@yahoo.com\" -\"@outlook.com\" -\"@hotmail.com\" -\"@aol.com\" -\"@icloud.com\"" },
    { name: "Business: Company emails (exclude all free)", value: "\"@\" -\"@gmail\" -\"@yahoo\" -\"@outlook\" -\"@hotmail\" -\"@aol\" -\"@icloud\" -\"@protonmail\" -\"@mail.com\" -\"@gmx\"" },
    { name: "Business: CEO email", value: "CEO \"@\" -\"@gmail.com\" -\"@yahoo.com\" -\"@hotmail.com\"" },
    { name: "Business: CTO email", value: "CTO \"@\" -\"@gmail.com\" -\"@yahoo.com\" -\"@hotmail.com\"" },
    { name: "Business: CFO email", value: "CFO \"@\" -\"@gmail.com\" -\"@yahoo.com\" -\"@hotmail.com\"" },
    { name: "Business: HR email", value: "\"Human Resources\" OR HR \"@\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Sales email", value: "Sales \"@\" -\"@gmail.com\" -\"@yahoo.com\" -\"@hotmail.com\"" },
    { name: "Business: Marketing email", value: "Marketing \"@\" -\"@gmail.com\" -\"@yahoo.com\" -\"@hotmail.com\"" },
    { name: "Business: IT Department email", value: "\"IT Manager\" OR \"IT Director\" \"@\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Finance Department email", value: "\"Finance\" OR \"Accounting\" \"@\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Procurement email", value: "\"Procurement\" OR \"Purchasing\" \"@\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Legal Department email", value: "\"Legal\" OR \"Counsel\" \"@\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Operations email", value: "\"Operations\" OR \"COO\" \"@\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Contact Us page emails", value: "\"contact us\" \"@\"" },
    { name: "Business: About page emails", value: "\"about us\" \"@\"" },
    { name: "Business: Staff directory emails", value: "\"staff directory\" OR \"our team\" \"@\"" },

    // ── Industry-Specific Business Emails ──
    { name: "Business: Technology companies", value: "\"@\" technology OR software OR SaaS -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Healthcare companies", value: "\"@\" healthcare OR medical OR hospital -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Financial services", value: "\"@\" \"financial services\" OR banking OR insurance -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Manufacturing companies", value: "\"@\" manufacturing OR industrial -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Retail companies", value: "\"@\" retail OR ecommerce -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Real estate companies", value: "\"@\" \"real estate\" OR property -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Education institutions", value: "\"@\" university OR college OR school OR \".edu\"" },
    { name: "Business: Government agencies", value: "\"@\" government OR \".gov\"" },
    { name: "Business: Legal firms", value: "\"@\" \"law firm\" OR attorney OR legal -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Consulting firms", value: "\"@\" consulting OR consultancy -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Construction companies", value: "\"@\" construction OR contractor OR builder -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Logistics companies", value: "\"@\" logistics OR shipping OR freight -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Pharma companies", value: "\"@\" pharmaceutical OR pharma OR biotech -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Telecom companies", value: "\"@\" telecom OR telecommunications -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Automotive companies", value: "\"@\" automotive OR automobile OR dealership -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Energy companies", value: "\"@\" energy OR oil OR gas OR utility -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Hospitality companies", value: "\"@\" hotel OR hospitality OR resort -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Agriculture companies", value: "\"@\" agriculture OR farming OR agribusiness -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Nonprofit organizations", value: "\"@\" nonprofit OR \"non-profit\" OR NGO OR charity -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "Business: Media & Advertising", value: "\"@\" media OR advertising OR \"ad agency\" -\"@gmail.com\" -\"@yahoo.com\"" },
    // ── NAICS Industry Codes ──
    { name: "NAICS 11 – Agriculture, Forestry, Fishing & Hunting", value: "\"@\" agriculture OR forestry OR fishing OR hunting -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 111 – Crop Production", value: "\"@\" crop OR grain OR vegetable OR fruit OR \"row crop\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 112 – Animal Production & Aquaculture", value: "\"@\" livestock OR cattle OR poultry OR aquaculture OR dairy -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 113 – Forestry & Logging", value: "\"@\" forestry OR logging OR timber OR lumber -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 114 – Fishing, Hunting & Trapping", value: "\"@\" fishing OR hunting OR trapping OR \"commercial fishing\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 115 – Support Activities for Agriculture & Forestry", value: "\"@\" \"farm management\" OR \"crop services\" OR \"soil preparation\" OR \"farm labor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 21 – Mining, Quarrying & Oil/Gas Extraction", value: "\"@\" mining OR quarrying OR \"oil extraction\" OR \"gas extraction\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 211 – Oil & Gas Extraction", value: "\"@\" \"oil extraction\" OR \"gas extraction\" OR \"crude petroleum\" OR \"natural gas\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 212 – Mining (except Oil & Gas)", value: "\"@\" mining OR \"coal mining\" OR \"metal ore\" OR quarry OR \"mineral mining\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 213 – Support Activities for Mining", value: "\"@\" \"drilling oil\" OR \"well services\" OR \"mining support\" OR \"exploration services\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 22 – Utilities", value: "\"@\" utility OR \"electric power\" OR \"natural gas distribution\" OR \"water supply\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 221 – Utilities (Electric, Gas, Water)", value: "\"@\" \"electric utility\" OR \"gas utility\" OR \"water utility\" OR \"power generation\" OR \"sewage treatment\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 23 – Construction", value: "\"@\" construction OR building OR contractor OR \"general contractor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 236 – Construction of Buildings", value: "\"@\" \"residential construction\" OR \"commercial construction\" OR \"building construction\" OR \"general contractor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 237 – Heavy & Civil Engineering Construction", value: "\"@\" \"heavy construction\" OR \"civil engineering\" OR highway OR bridge OR \"infrastructure construction\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 238 – Specialty Trade Contractors", value: "\"@\" plumbing OR electrical OR HVAC OR roofing OR \"specialty contractor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 31-33 – Manufacturing", value: "\"@\" manufacturing OR factory OR production OR \"assembly plant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 311 – Food Manufacturing", value: "\"@\" \"food manufacturing\" OR \"food processing\" OR bakery OR \"meat processing\" OR \"dairy products\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 312 – Beverage & Tobacco Manufacturing", value: "\"@\" brewery OR winery OR distillery OR \"beverage manufacturing\" OR tobacco -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 313 – Textile Mills", value: "\"@\" \"textile mill\" OR \"fiber manufacturing\" OR \"yarn spinning\" OR weaving -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 314 – Textile Product Mills", value: "\"@\" \"textile products\" OR carpet OR curtain OR \"textile furnishings\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 315 – Apparel Manufacturing", value: "\"@\" \"apparel manufacturing\" OR \"clothing manufacturing\" OR garment OR \"cut and sew\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 316 – Leather & Allied Products", value: "\"@\" leather OR footwear OR \"leather goods\" OR luggage -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 321 – Wood Product Manufacturing", value: "\"@\" \"wood product\" OR sawmill OR \"wood preservation\" OR plywood -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 322 – Paper Manufacturing", value: "\"@\" \"paper manufacturing\" OR \"pulp mill\" OR paperboard OR \"paper products\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 323 – Printing & Related Support", value: "\"@\" printing OR \"print shop\" OR \"commercial printing\" OR lithography -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 324 – Petroleum & Coal Products", value: "\"@\" \"petroleum refining\" OR \"coal products\" OR asphalt OR \"lubricating oils\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 325 – Chemical Manufacturing", value: "\"@\" \"chemical manufacturing\" OR pharmaceutical OR pesticide OR \"industrial chemicals\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 326 – Plastics & Rubber Products", value: "\"@\" plastics OR rubber OR \"plastic products\" OR \"rubber products\" OR \"injection molding\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 327 – Nonmetallic Mineral Products", value: "\"@\" glass OR cement OR concrete OR ceramics OR \"mineral products\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 331 – Primary Metal Manufacturing", value: "\"@\" \"steel manufacturing\" OR \"aluminum manufacturing\" OR smelting OR foundry OR \"primary metal\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 332 – Fabricated Metal Products", value: "\"@\" \"metal fabrication\" OR forging OR stamping OR \"machine shop\" OR \"metal stamping\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 333 – Machinery Manufacturing", value: "\"@\" \"machinery manufacturing\" OR \"industrial machinery\" OR turbine OR \"construction machinery\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 334 – Computer & Electronic Products", value: "\"@\" \"computer manufacturing\" OR semiconductor OR \"electronic components\" OR \"circuit board\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 335 – Electrical Equipment & Appliances", value: "\"@\" \"electrical equipment\" OR \"household appliances\" OR \"lighting equipment\" OR \"electrical components\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 336 – Transportation Equipment", value: "\"@\" \"automobile manufacturing\" OR \"aerospace manufacturing\" OR \"ship building\" OR \"railroad rolling stock\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 337 – Furniture & Related Products", value: "\"@\" \"furniture manufacturing\" OR \"office furniture\" OR \"kitchen cabinet\" OR mattress -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 339 – Miscellaneous Manufacturing", value: "\"@\" \"medical device\" OR jewelry OR \"sporting goods manufacturing\" OR \"toy manufacturing\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 42 – Wholesale Trade", value: "\"@\" wholesale OR distributor OR \"wholesale trade\" OR \"merchant wholesaler\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 423 – Durable Goods Wholesalers", value: "\"@\" \"durable goods\" OR \"wholesale electronics\" OR \"wholesale machinery\" OR \"wholesale lumber\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 424 – Nondurable Goods Wholesalers", value: "\"@\" \"nondurable goods\" OR \"wholesale grocery\" OR \"wholesale apparel\" OR \"wholesale chemicals\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 425 – Wholesale Trade Agents & Brokers", value: "\"@\" \"wholesale agent\" OR \"wholesale broker\" OR \"trade agent\" OR \"merchandise broker\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 44-45 – Retail Trade", value: "\"@\" retail OR \"retail store\" OR \"retail sales\" OR retailer -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 441 – Motor Vehicle & Parts Dealers", value: "\"@\" \"auto dealer\" OR \"car dealership\" OR \"auto parts\" OR \"motor vehicle dealer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 442 – Furniture & Home Furnishings", value: "\"@\" \"furniture store\" OR \"home furnishings\" OR \"floor covering\" OR \"window treatment\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 443 – Electronics & Appliance Stores", value: "\"@\" \"electronics store\" OR \"appliance store\" OR \"computer store\" OR \"consumer electronics\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 444 – Building Material & Garden Equipment", value: "\"@\" \"building materials\" OR \"hardware store\" OR \"garden center\" OR \"home improvement\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 445 – Food & Beverage Retailers", value: "\"@\" \"grocery store\" OR supermarket OR \"food retailer\" OR \"specialty food\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 446 – Health & Personal Care Retailers", value: "\"@\" pharmacy OR drugstore OR \"health store\" OR \"personal care store\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 447 – Gasoline Stations", value: "\"@\" \"gas station\" OR \"fuel station\" OR \"convenience store\" OR \"gasoline station\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 448 – Clothing & Accessories Stores", value: "\"@\" \"clothing store\" OR \"apparel store\" OR \"shoe store\" OR \"jewelry store\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 451 – Sporting Goods, Hobby, Book & Music", value: "\"@\" \"sporting goods\" OR \"hobby shop\" OR bookstore OR \"music store\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 452 – General Merchandise Retailers", value: "\"@\" \"department store\" OR \"general merchandise\" OR \"warehouse club\" OR \"variety store\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 453 – Miscellaneous Store Retailers", value: "\"@\" \"gift shop\" OR \"pet store\" OR \"office supply\" OR \"used merchandise\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 454 – Nonstore Retailers", value: "\"@\" \"e-commerce\" OR \"online retailer\" OR \"mail order\" OR \"vending machine\" OR \"direct selling\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 48-49 – Transportation & Warehousing", value: "\"@\" transportation OR warehousing OR logistics OR freight OR carrier -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 481 – Air Transportation", value: "\"@\" airline OR \"air cargo\" OR \"air transportation\" OR \"charter flights\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 482 – Rail Transportation", value: "\"@\" railroad OR \"rail transportation\" OR \"freight rail\" OR \"passenger rail\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 483 – Water Transportation", value: "\"@\" \"water transportation\" OR shipping OR \"marine cargo\" OR ferry -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 484 – Truck Transportation", value: "\"@\" trucking OR \"truck transportation\" OR \"freight trucking\" OR \"long haul\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 485 – Transit & Ground Passenger Transportation", value: "\"@\" transit OR \"bus service\" OR taxi OR \"ground transportation\" OR \"ride service\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 486 – Pipeline Transportation", value: "\"@\" pipeline OR \"pipeline transportation\" OR \"natural gas pipeline\" OR \"petroleum pipeline\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 487 – Scenic & Sightseeing Transportation", value: "\"@\" \"sightseeing\" OR \"scenic tours\" OR \"tour boat\" OR \"excursion train\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 488 – Support Activities for Transportation", value: "\"@\" \"freight handling\" OR \"marine terminal\" OR \"air traffic\" OR \"transportation support\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 491 – Postal Service", value: "\"@\" \"postal service\" OR \"mail delivery\" OR \"post office\" OR courier -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 492 – Couriers & Messengers", value: "\"@\" courier OR messenger OR \"express delivery\" OR \"parcel delivery\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 493 – Warehousing & Storage", value: "\"@\" warehousing OR \"self storage\" OR \"cold storage\" OR \"warehouse storage\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 51 – Information", value: "\"@\" publishing OR broadcasting OR telecommunications OR \"data processing\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 511 – Publishing Industries", value: "\"@\" publishing OR \"book publisher\" OR \"newspaper publisher\" OR \"software publisher\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 512 – Motion Picture & Sound Recording", value: "\"@\" \"motion picture\" OR \"film production\" OR \"sound recording\" OR \"music production\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 515 – Broadcasting (except Internet)", value: "\"@\" broadcasting OR \"radio station\" OR \"television station\" OR \"cable network\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 517 – Telecommunications", value: "\"@\" telecommunications OR telecom OR \"wireless carrier\" OR \"internet service provider\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 518 – Data Processing & Hosting", value: "\"@\" \"data processing\" OR \"web hosting\" OR \"data center\" OR \"cloud hosting\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 519 – Web Search Portals, Libraries & Archives", value: "\"@\" \"web portal\" OR \"search engine\" OR library OR archive OR \"information services\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 52 – Finance & Insurance", value: "\"@\" finance OR insurance OR banking OR \"financial services\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 521 – Monetary Authorities", value: "\"@\" \"central bank\" OR \"monetary authority\" OR \"federal reserve\" OR \"reserve bank\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 522 – Credit Intermediation", value: "\"@\" \"commercial bank\" OR \"credit union\" OR \"savings institution\" OR \"mortgage lender\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 523 – Securities & Commodity Contracts", value: "\"@\" \"securities broker\" OR \"investment banking\" OR \"commodity contracts\" OR \"stock exchange\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 524 – Insurance Carriers", value: "\"@\" \"insurance carrier\" OR \"insurance agency\" OR \"insurance broker\" OR underwriting -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 525 – Funds, Trusts & Other Financial Vehicles", value: "\"@\" \"pension fund\" OR \"trust fund\" OR \"mutual fund\" OR \"investment fund\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 53 – Real Estate & Rental/Leasing", value: "\"@\" \"real estate\" OR rental OR leasing OR property -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 531 – Real Estate", value: "\"@\" \"real estate agent\" OR \"real estate broker\" OR \"property management\" OR \"real estate appraiser\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 532 – Rental & Leasing Services", value: "\"@\" \"equipment rental\" OR \"car rental\" OR \"consumer goods rental\" OR leasing -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 533 – Lessors of Nonfinancial Intangible Assets", value: "\"@\" \"franchise\" OR \"trademark licensing\" OR \"patent licensing\" OR \"intellectual property leasing\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 54 – Professional, Scientific & Technical Services", value: "\"@\" consulting OR \"professional services\" OR \"technical services\" OR \"scientific research\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 541 – Professional, Scientific & Technical Services", value: "\"@\" \"law firm\" OR accounting OR consulting OR engineering OR \"research and development\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 55 – Management of Companies", value: "\"@\" \"holding company\" OR \"corporate office\" OR \"management company\" OR \"head office\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 551 – Management of Companies & Enterprises", value: "\"@\" \"holding company\" OR \"corporate headquarters\" OR \"management office\" OR \"enterprise management\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 56 – Administrative & Support Services", value: "\"@\" \"administrative services\" OR \"staffing agency\" OR \"waste management\" OR \"security services\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 561 – Administrative & Support Services", value: "\"@\" \"staffing agency\" OR \"temporary help\" OR \"janitorial services\" OR \"call center\" OR \"document preparation\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 562 – Waste Management & Remediation", value: "\"@\" \"waste management\" OR \"waste collection\" OR remediation OR \"hazardous waste\" OR recycling -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 61 – Educational Services", value: "\"@\" education OR school OR university OR college OR training -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 611 – Educational Services", value: "\"@\" \"elementary school\" OR \"secondary school\" OR university OR \"trade school\" OR \"educational support\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 62 – Health Care & Social Assistance", value: "\"@\" healthcare OR hospital OR \"social assistance\" OR \"medical practice\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 621 – Ambulatory Health Care Services", value: "\"@\" \"physician office\" OR \"dental office\" OR \"outpatient care\" OR \"medical laboratory\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 622 – Hospitals", value: "\"@\" hospital OR \"medical center\" OR \"surgical hospital\" OR \"psychiatric hospital\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 623 – Nursing & Residential Care", value: "\"@\" \"nursing home\" OR \"assisted living\" OR \"residential care\" OR \"continuing care\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 624 – Social Assistance", value: "\"@\" \"child care\" OR \"social services\" OR \"community food\" OR \"vocational rehabilitation\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 71 – Arts, Entertainment & Recreation", value: "\"@\" entertainment OR recreation OR \"performing arts\" OR museum -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 711 – Performing Arts & Spectator Sports", value: "\"@\" theater OR \"performing arts\" OR \"spectator sports\" OR \"sports team\" OR promoter -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 712 – Museums, Historical Sites & Similar", value: "\"@\" museum OR \"historical site\" OR \"botanical garden\" OR \"nature park\" OR zoo -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 713 – Amusement, Gambling & Recreation", value: "\"@\" \"amusement park\" OR casino OR \"golf course\" OR \"fitness center\" OR \"ski resort\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 72 – Accommodation & Food Services", value: "\"@\" hotel OR restaurant OR \"food service\" OR accommodation -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 721 – Accommodation", value: "\"@\" hotel OR motel OR \"bed and breakfast\" OR \"RV park\" OR resort -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 722 – Food Services & Drinking Places", value: "\"@\" restaurant OR \"fast food\" OR catering OR bar OR \"drinking place\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 81 – Other Services", value: "\"@\" repair OR \"personal care\" OR \"religious organization\" OR \"civic organization\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 811 – Repair & Maintenance", value: "\"@\" \"auto repair\" OR \"appliance repair\" OR \"electronic repair\" OR \"equipment repair\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 812 – Personal & Laundry Services", value: "\"@\" \"hair salon\" OR \"dry cleaning\" OR \"funeral home\" OR \"pet care\" OR laundry -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 813 – Religious, Civic & Professional Organizations", value: "\"@\" church OR \"civic organization\" OR \"professional association\" OR \"labor union\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 814 – Private Households", value: "\"@\" \"private household\" OR \"household employer\" OR \"domestic worker\" OR \"personal employee\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 92 – Public Administration", value: "\"@\" government OR \"public administration\" OR federal OR municipal -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 921 – Executive & Legislative Government", value: "\"@\" \"executive office\" OR legislature OR \"city council\" OR \"governor office\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 922 – Justice, Public Order & Safety", value: "\"@\" \"police department\" OR \"fire department\" OR court OR \"corrections facility\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 923 – Human Resource Programs Administration", value: "\"@\" \"social security\" OR \"unemployment insurance\" OR \"public health program\" OR \"veterans affairs\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 924 – Environmental Quality Programs", value: "\"@\" \"environmental agency\" OR \"air quality\" OR \"water quality\" OR \"environmental regulation\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 925 – Housing & Community Development", value: "\"@\" \"housing authority\" OR \"community development\" OR \"urban planning\" OR \"rural development\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 926 – Economic Programs Administration", value: "\"@\" \"economic development\" OR \"trade regulation\" OR \"transportation program\" OR \"utility regulation\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 927 – Space Research & Technology", value: "\"@\" \"space research\" OR \"space technology\" OR NASA OR \"aerospace agency\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "NAICS 928 – National Security & International Affairs", value: "\"@\" \"national security\" OR \"defense department\" OR \"international affairs\" OR \"intelligence agency\" -\"@gmail.com\" -\"@yahoo.com\"" },
    // ── SOC Occupation Codes ──
    { name: "SOC 11-0000 – Management Occupations", value: "\"@\" manager OR director OR executive OR CEO OR \"vice president\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 11-1000 – Top Executives", value: "\"@\" CEO OR COO OR CFO OR \"chief executive\" OR \"general manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 11-2000 – Advertising, Marketing, PR & Sales Managers", value: "\"@\" \"marketing manager\" OR \"advertising manager\" OR \"PR manager\" OR \"sales manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 11-3000 – Operations Specialties Managers", value: "\"@\" \"operations manager\" OR \"IT manager\" OR \"financial manager\" OR \"compensation manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 11-9000 – Other Management Occupations", value: "\"@\" \"construction manager\" OR \"education administrator\" OR \"food service manager\" OR \"property manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 13-0000 – Business & Financial Operations", value: "\"@\" analyst OR accountant OR auditor OR \"business operations\" OR \"financial analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 13-1000 – Business Operations Specialists", value: "\"@\" \"project manager\" OR \"management analyst\" OR \"compliance officer\" OR \"meeting planner\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 13-2000 – Financial Specialists", value: "\"@\" accountant OR auditor OR \"financial analyst\" OR \"budget analyst\" OR \"tax examiner\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 15-0000 – Computer & Mathematical", value: "\"@\" developer OR programmer OR \"software engineer\" OR \"data scientist\" OR mathematician -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 15-1200 – Computer Occupations", value: "\"@\" \"software developer\" OR \"systems administrator\" OR \"database administrator\" OR \"web developer\" OR \"network architect\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 15-2000 – Mathematical Science", value: "\"@\" mathematician OR statistician OR actuary OR \"operations research analyst\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 17-0000 – Architecture & Engineering", value: "\"@\" architect OR engineer OR surveyor OR drafter -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 17-1000 – Architects, Surveyors & Cartographers", value: "\"@\" architect OR \"landscape architect\" OR surveyor OR cartographer -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 17-2000 – Engineers", value: "\"@\" \"civil engineer\" OR \"mechanical engineer\" OR \"electrical engineer\" OR \"chemical engineer\" OR \"industrial engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 17-3000 – Drafters, Engineering Technicians", value: "\"@\" drafter OR \"engineering technician\" OR \"surveying technician\" OR \"CAD technician\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 19-0000 – Life, Physical & Social Science", value: "\"@\" scientist OR researcher OR biologist OR chemist OR physicist OR sociologist -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 19-1000 – Life Scientists", value: "\"@\" biologist OR microbiologist OR zoologist OR \"conservation scientist\" OR epidemiologist -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 19-2000 – Physical Scientists", value: "\"@\" physicist OR chemist OR astronomer OR geoscientist OR \"atmospheric scientist\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 19-3000 – Social Scientists", value: "\"@\" economist OR psychologist OR sociologist OR \"political scientist\" OR \"urban planner\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 19-4000 – Life, Physical & Social Science Technicians", value: "\"@\" \"lab technician\" OR \"chemical technician\" OR \"biological technician\" OR \"environmental technician\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 21-0000 – Community & Social Service", value: "\"@\" counselor OR \"social worker\" OR \"community health\" OR \"substance abuse\" OR \"probation officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 21-1000 – Counselors, Social Workers & Community Workers", value: "\"@\" \"social worker\" OR counselor OR \"mental health counselor\" OR \"community health worker\" OR \"probation officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 21-2000 – Religious Workers", value: "\"@\" clergy OR pastor OR chaplain OR \"religious director\" OR minister -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 23-0000 – Legal", value: "\"@\" lawyer OR attorney OR judge OR paralegal OR \"legal assistant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 23-1000 – Lawyers, Judges & Related", value: "\"@\" lawyer OR attorney OR judge OR magistrate OR \"administrative law judge\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 23-2000 – Legal Support Workers", value: "\"@\" paralegal OR \"legal assistant\" OR \"court reporter\" OR \"title examiner\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 25-0000 – Educational Instruction & Library", value: "\"@\" teacher OR professor OR instructor OR librarian OR tutor -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 25-1000 – Postsecondary Teachers", value: "\"@\" professor OR \"associate professor\" OR \"assistant professor\" OR lecturer OR \"postsecondary instructor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 25-2000 – Primary, Secondary & Special Ed Teachers", value: "\"@\" \"elementary teacher\" OR \"middle school teacher\" OR \"high school teacher\" OR \"special education teacher\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 25-3000 – Other Teachers & Instructors", value: "\"@\" tutor OR \"substitute teacher\" OR \"adult education\" OR \"self-enrichment teacher\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 25-4000 – Librarians, Curators & Archivists", value: "\"@\" librarian OR curator OR archivist OR \"museum technician\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 25-9000 – Other Educational Workers", value: "\"@\" \"teaching assistant\" OR \"instructional coordinator\" OR \"education aide\" OR \"school counselor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 27-0000 – Arts, Design, Entertainment, Sports & Media", value: "\"@\" designer OR artist OR writer OR reporter OR musician OR athlete -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 27-1000 – Art & Design Workers", value: "\"@\" \"graphic designer\" OR \"interior designer\" OR \"industrial designer\" OR \"floral designer\" OR illustrator -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 27-2000 – Entertainers, Performers & Sports", value: "\"@\" actor OR musician OR dancer OR athlete OR coach OR choreographer -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 27-3000 – Media & Communication Workers", value: "\"@\" reporter OR editor OR \"public relations\" OR writer OR author OR \"technical writer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 27-4000 – Media & Communication Equipment Workers", value: "\"@\" photographer OR \"camera operator\" OR \"film editor\" OR \"sound engineer\" OR \"broadcast technician\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 29-0000 – Healthcare Practitioners & Technical", value: "\"@\" physician OR nurse OR pharmacist OR therapist OR \"registered nurse\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 29-1000 – Health Diagnosing & Treating Practitioners", value: "\"@\" physician OR surgeon OR dentist OR optometrist OR \"physician assistant\" OR \"nurse practitioner\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 29-2000 – Health Technologists & Technicians", value: "\"@\" \"medical technologist\" OR \"radiologic technician\" OR \"dental hygienist\" OR \"pharmacy technician\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 29-9000 – Other Healthcare Practitioners", value: "\"@\" \"health information\" OR dietitian OR audiologist OR \"athletic trainer\" OR \"occupational health\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 31-0000 – Healthcare Support", value: "\"@\" \"nursing assistant\" OR \"home health aide\" OR \"medical assistant\" OR \"physical therapy aide\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 31-1000 – Nursing Assistants, Orderlies & Psychiatric Aides", value: "\"@\" \"nursing assistant\" OR orderly OR \"psychiatric aide\" OR CNA -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 31-9000 – Other Healthcare Support", value: "\"@\" \"medical assistant\" OR phlebotomist OR \"physical therapy aide\" OR \"massage therapist\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 33-0000 – Protective Service", value: "\"@\" \"police officer\" OR firefighter OR \"security guard\" OR detective OR \"correctional officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 33-1000 – Supervisors of Protective Service", value: "\"@\" \"police sergeant\" OR \"fire captain\" OR \"security supervisor\" OR \"corrections supervisor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 33-2000 – Firefighting & Prevention", value: "\"@\" firefighter OR \"fire inspector\" OR \"fire investigator\" OR \"forest firefighter\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 33-3000 – Law Enforcement", value: "\"@\" \"police officer\" OR detective OR \"criminal investigator\" OR sheriff OR \"transit police\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 33-9000 – Other Protective Service", value: "\"@\" \"security guard\" OR \"crossing guard\" OR \"lifeguard\" OR \"TSA officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 35-0000 – Food Preparation & Serving", value: "\"@\" chef OR cook OR \"food server\" OR bartender OR \"food preparation\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 35-1000 – Supervisors of Food Preparation", value: "\"@\" \"head chef\" OR \"kitchen manager\" OR \"food service supervisor\" OR \"executive chef\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 35-2000 – Cooks & Food Preparation", value: "\"@\" cook OR \"prep cook\" OR \"line cook\" OR \"short order cook\" OR \"food preparation worker\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 35-3000 – Food & Beverage Serving", value: "\"@\" waiter OR waitress OR bartender OR barista OR \"food server\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 35-9000 – Other Food Preparation & Serving", value: "\"@\" \"dining room attendant\" OR dishwasher OR \"food runner\" OR \"cafeteria attendant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 37-0000 – Building & Grounds Cleaning/Maintenance", value: "\"@\" janitor OR custodian OR \"grounds keeper\" OR maid OR \"pest control\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 37-1000 – Supervisors of Building & Grounds", value: "\"@\" \"janitorial supervisor\" OR \"housekeeping supervisor\" OR \"grounds maintenance supervisor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 37-2000 – Building Cleaning & Pest Control", value: "\"@\" janitor OR custodian OR maid OR \"pest control technician\" OR housekeeper -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 37-3000 – Grounds Maintenance", value: "\"@\" landscaper OR \"groundskeeper\" OR \"tree trimmer\" OR \"lawn service\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 39-0000 – Personal Care & Service", value: "\"@\" hairdresser OR \"fitness trainer\" OR \"child care\" OR \"personal care aide\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 39-1000 – Supervisors of Personal Care", value: "\"@\" \"personal care supervisor\" OR \"spa manager\" OR \"salon manager\" OR \"recreation supervisor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 39-2000 – Animal Care & Service", value: "\"@\" \"animal trainer\" OR \"veterinary assistant\" OR \"dog groomer\" OR \"animal caretaker\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 39-3000 – Entertainment Attendants", value: "\"@\" \"usher\" OR \"amusement attendant\" OR \"recreation attendant\" OR \"locker room attendant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 39-4000 – Funeral Service", value: "\"@\" \"funeral director\" OR mortician OR embalmer OR \"funeral attendant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 39-5000 – Personal Appearance", value: "\"@\" hairdresser OR barber OR \"makeup artist\" OR \"skin care specialist\" OR manicurist -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 39-9000 – Other Personal Care & Service", value: "\"@\" \"personal care aide\" OR \"fitness trainer\" OR \"tour guide\" OR \"child care worker\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 41-0000 – Sales & Related", value: "\"@\" \"sales representative\" OR \"sales associate\" OR \"account executive\" OR cashier -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 41-1000 – Supervisors of Sales", value: "\"@\" \"sales manager\" OR \"sales supervisor\" OR \"retail manager\" OR \"store manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 41-2000 – Retail Sales", value: "\"@\" \"retail sales\" OR cashier OR \"sales associate\" OR \"sales clerk\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 41-3000 – Sales Representatives, Services", value: "\"@\" \"insurance agent\" OR \"real estate agent\" OR \"travel agent\" OR \"advertising sales\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 41-4000 – Sales Representatives, Wholesale/Manufacturing", value: "\"@\" \"sales representative\" OR \"account manager\" OR \"territory manager\" OR \"wholesale sales\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 41-9000 – Other Sales & Related", value: "\"@\" telemarketer OR \"door to door\" OR \"sales engineer\" OR \"parts salesperson\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 43-0000 – Office & Administrative Support", value: "\"@\" \"administrative assistant\" OR secretary OR clerk OR receptionist OR \"office manager\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 43-1000 – Supervisors of Office & Administrative Support", value: "\"@\" \"office manager\" OR \"administrative supervisor\" OR \"clerical supervisor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 43-2000 – Communications Equipment Operators", value: "\"@\" \"switchboard operator\" OR \"telephone operator\" OR dispatcher OR \"communications operator\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 43-3000 – Financial Clerks", value: "\"@\" \"billing clerk\" OR bookkeeper OR \"payroll clerk\" OR teller OR \"accounting clerk\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 43-4000 – Information & Record Clerks", value: "\"@\" receptionist OR \"file clerk\" OR \"court clerk\" OR \"medical records\" OR \"customer service representative\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 43-5000 – Material Recording & Dispatching", value: "\"@\" dispatcher OR \"shipping clerk\" OR \"stock clerk\" OR \"production clerk\" OR \"order clerk\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 43-6000 – Secretaries & Administrative Assistants", value: "\"@\" secretary OR \"administrative assistant\" OR \"executive assistant\" OR \"legal secretary\" OR \"medical secretary\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 43-9000 – Other Office & Administrative Support", value: "\"@\" \"data entry\" OR \"mail clerk\" OR \"office clerk\" OR \"proofreader\" OR \"statistical assistant\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 45-0000 – Farming, Fishing & Forestry", value: "\"@\" farmer OR rancher OR fisherman OR \"logging worker\" OR \"agricultural worker\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 45-1000 – Supervisors of Farming, Fishing & Forestry", value: "\"@\" \"farm supervisor\" OR \"ranch foreman\" OR \"logging supervisor\" OR \"agricultural supervisor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 45-2000 – Agricultural Workers", value: "\"@\" \"farm worker\" OR \"crop worker\" OR \"nursery worker\" OR \"agricultural inspector\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 45-3000 – Fishing & Hunting Workers", value: "\"@\" fisherman OR \"fishing vessel\" OR hunter OR trapper -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 45-4000 – Forest, Conservation & Logging", value: "\"@\" \"log grader\" OR \"forest worker\" OR \"conservation worker\" OR \"logging equipment operator\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 47-0000 – Construction & Extraction", value: "\"@\" carpenter OR electrician OR plumber OR \"construction worker\" OR welder -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 47-1000 – Supervisors of Construction & Extraction", value: "\"@\" \"construction supervisor\" OR \"construction foreman\" OR \"site superintendent\" OR \"extraction supervisor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 47-2000 – Construction Trades", value: "\"@\" carpenter OR electrician OR plumber OR bricklayer OR roofer OR \"iron worker\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 47-3000 – Helpers, Construction Trades", value: "\"@\" \"construction helper\" OR \"electrician helper\" OR \"plumber helper\" OR \"carpenter helper\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 47-4000 – Other Construction", value: "\"@\" \"fence erector\" OR \"hazmat worker\" OR \"rail-track worker\" OR \"septic tank servicer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 47-5000 – Extraction Workers", value: "\"@\" \"mining machine operator\" OR \"oil derrick\" OR \"rotary drill\" OR \"explosives worker\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 49-0000 – Installation, Maintenance & Repair", value: "\"@\" technician OR mechanic OR installer OR \"maintenance worker\" OR \"repair technician\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 49-1000 – Supervisors of Installation & Maintenance", value: "\"@\" \"maintenance supervisor\" OR \"installation supervisor\" OR \"repair supervisor\" OR \"mechanic supervisor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 49-2000 – Electrical & Electronic Equipment Mechanics", value: "\"@\" \"electronics technician\" OR \"avionics technician\" OR \"electrical repairer\" OR \"telecom installer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 49-3000 – Vehicle & Mobile Equipment Mechanics", value: "\"@\" \"auto mechanic\" OR \"diesel mechanic\" OR \"aircraft mechanic\" OR \"bus mechanic\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 49-9000 – Other Installation, Maintenance & Repair", value: "\"@\" \"HVAC technician\" OR locksmith OR \"maintenance worker\" OR \"appliance repairer\" OR millwright -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 51-0000 – Production", value: "\"@\" \"machine operator\" OR assembler OR welder OR \"production worker\" OR machinist -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 51-1000 – Supervisors of Production", value: "\"@\" \"production supervisor\" OR \"manufacturing supervisor\" OR \"plant foreman\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 51-2000 – Assemblers & Fabricators", value: "\"@\" assembler OR fabricator OR \"electrical assembler\" OR \"team assembler\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 51-3000 – Food Processing", value: "\"@\" \"food batchmaker\" OR \"meat cutter\" OR baker OR \"food processing worker\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 51-4000 – Metal Workers & Plastic Workers", value: "\"@\" machinist OR welder OR \"CNC operator\" OR \"tool and die maker\" OR \"metal fabricator\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 51-5000 – Printing Workers", value: "\"@\" \"printing press operator\" OR \"prepress technician\" OR \"print binding\" OR \"digital printing\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 51-6000 – Textile, Apparel & Furnishings", value: "\"@\" \"sewing machine operator\" OR tailor OR upholsterer OR \"textile worker\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 51-7000 – Woodworkers", value: "\"@\" cabinetmaker OR \"woodworking machine\" OR \"sawing machine operator\" OR woodworker -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 51-8000 – Plant & System Operators", value: "\"@\" \"power plant operator\" OR \"water treatment operator\" OR \"chemical plant operator\" OR \"stationary engineer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 51-9000 – Other Production", value: "\"@\" inspector OR \"packaging operator\" OR \"painting worker\" OR \"jewelry maker\" OR \"dental lab technician\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 53-0000 – Transportation & Material Moving", value: "\"@\" driver OR pilot OR \"truck driver\" OR \"forklift operator\" OR \"material handler\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 53-1000 – Supervisors of Transportation & Material Moving", value: "\"@\" \"transportation supervisor\" OR \"warehouse supervisor\" OR \"logistics supervisor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 53-2000 – Air Transportation Workers", value: "\"@\" pilot OR \"airline pilot\" OR \"flight engineer\" OR \"air traffic controller\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 53-3000 – Motor Vehicle Operators", value: "\"@\" \"truck driver\" OR \"bus driver\" OR \"delivery driver\" OR \"taxi driver\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 53-4000 – Rail Transportation Workers", value: "\"@\" \"locomotive engineer\" OR \"rail yard worker\" OR \"train conductor\" OR \"subway operator\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 53-5000 – Water Transportation Workers", value: "\"@\" \"ship captain\" OR \"ship engineer\" OR sailor OR \"boat operator\" OR mate -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 53-6000 – Other Transportation Workers", value: "\"@\" \"parking attendant\" OR \"traffic technician\" OR \"bridge tender\" OR \"transportation inspector\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 53-7000 – Material Moving Workers", value: "\"@\" \"forklift operator\" OR \"crane operator\" OR \"material handler\" OR \"conveyor operator\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 55-0000 – Military Specific", value: "\"@\" military OR \"armed forces\" OR veteran OR \"military officer\" OR \"enlisted military\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 55-1000 – Military Officer Special & Tactical Operations", value: "\"@\" \"military officer\" OR \"special operations\" OR \"tactical officer\" OR \"infantry officer\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 55-2000 – First-Line Enlisted Military Supervisors", value: "\"@\" sergeant OR \"staff sergeant\" OR \"master sergeant\" OR \"first sergeant\" OR \"military supervisor\" -\"@gmail.com\" -\"@yahoo.com\"" },
    { name: "SOC 55-3000 – Military Enlisted Tactical Operations", value: "\"@\" \"infantry\" OR \"combat engineer\" OR \"military intelligence\" OR \"special forces enlisted\" -\"@gmail.com\" -\"@yahoo.com\"" }
];

serpdigger.api.footprints.get = function (callback) {
    fetch(serpdigger.config.api.footprints.url, {
        method: serpdigger.config.api.footprints.method,
        cache: 'no-cache'
    })
    .then(function(response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var ct = (response.headers.get('content-type') || '').toLowerCase();
        if (ct.indexOf('text/html') !== -1) throw new Error('Expected text/plain footprints but received text/html');
        return response.text();
    })
    .then(function(data) {
        var trimmed = data.trimStart();
        if (trimmed.charAt(0) === '<' || trimmed.indexOf('<!DOCTYPE') !== -1) {
            throw new Error('Response body contains HTML markup instead of footprints data');
        }
        var parsed = _parseFootprints(data).filter(function (f) {
            return f.name && f.value;
        });
        callback(parsed.length > 0 ? parsed : _builtinFootprints);
    })
    .catch(function() {
        callback(_builtinFootprints);
    });
};