-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "vendorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Membership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Membership_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Property_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Unit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serialNumber" TEXT,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Asset_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Vendor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "propertyId" TEXT NOT NULL,
    "maintenanceRequestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "MaintenanceRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaintenanceRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "assetId" TEXT,
    "assignedVendorId" TEXT,
    "requestedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaintenanceRequest_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceRequest_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceRequest_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceRequest_assignedVendorId_fkey" FOREIGN KEY ("assignedVendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Membership" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "propertyId" TEXT NOT NULL,
    "maintenanceRequestId" TEXT,
    "documentId" TEXT,
    "actorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimelineEvent_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "MaintenanceRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimelineEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_roleId_idx" ON "Membership"("roleId");

-- CreateIndex
CREATE INDEX "Membership_vendorId_idx" ON "Membership"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Property_organizationId_idx" ON "Property"("organizationId");

-- CreateIndex
CREATE INDEX "Property_organizationId_name_idx" ON "Property"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Unit_propertyId_idx" ON "Unit"("propertyId");

-- CreateIndex
CREATE INDEX "Unit_propertyId_name_idx" ON "Unit"("propertyId", "name");

-- CreateIndex
CREATE INDEX "Asset_propertyId_idx" ON "Asset"("propertyId");

-- CreateIndex
CREATE INDEX "Asset_unitId_idx" ON "Asset"("unitId");

-- CreateIndex
CREATE INDEX "Vendor_organizationId_idx" ON "Vendor"("organizationId");

-- CreateIndex
CREATE INDEX "Document_propertyId_idx" ON "Document"("propertyId");

-- CreateIndex
CREATE INDEX "Document_maintenanceRequestId_idx" ON "Document"("maintenanceRequestId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_propertyId_idx" ON "MaintenanceRequest"("propertyId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_unitId_idx" ON "MaintenanceRequest"("unitId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_assetId_idx" ON "MaintenanceRequest"("assetId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_assignedVendorId_idx" ON "MaintenanceRequest"("assignedVendorId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_requestedById_idx" ON "MaintenanceRequest"("requestedById");

-- CreateIndex
CREATE INDEX "TimelineEvent_propertyId_idx" ON "TimelineEvent"("propertyId");

-- CreateIndex
CREATE INDEX "TimelineEvent_maintenanceRequestId_idx" ON "TimelineEvent"("maintenanceRequestId");

-- CreateIndex
CREATE INDEX "TimelineEvent_documentId_idx" ON "TimelineEvent"("documentId");

-- CreateIndex
CREATE INDEX "TimelineEvent_actorId_idx" ON "TimelineEvent"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
INSERT INTO Permission VALUES('op7tne0gyct6kma5kdwt70sh','create','organization','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('vq1zqeoisxuwxvlmnf9rk15j','create','organization','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('dy8fgif5892wfozwoeuvhkk8','read','organization','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('oren36rwcxda3vnltwoqlkxt','read','organization','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('qo36ha8gq5fssthrj441ghld','update','organization','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('jfb1s2zdsyy16nopqq4qn3cf','update','organization','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('xt305o5q4xmoin6vjdonc7ey','delete','organization','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('dnwmk3qcnnyrjl90xmce9odz','delete','organization','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('o1p02tuarzcli9b4hl12fibm','create','membership','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('z6olewpvwoapnzpxn8b1nsjq','create','membership','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('kds8q3k1d8ffkcitgw2jvxz4','read','membership','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('kasp9yasmtetr0w0fql2l3tc','read','membership','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('pzbvgx3zg2qu8lyep5yahq91','update','membership','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('l5nitvslnmmeajcvbfzst8bi','update','membership','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('sbr949gtxuuic94bb25287uh','delete','membership','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('ym7jtspsfhhx9wz4typrvfcz','delete','membership','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('yd7gb8prz6c3m6k2zvaxk4g1','create','property','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('pajh2kcqv0yc2iilywetqxqu','create','property','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('g0blrtnrfyl5hvwoskrrvv6s','read','property','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('u1ihyskpnv27c3oqag9l95yz','read','property','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('gu4vkzeo6o5knatmkyz9k4cp','update','property','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('n87rjk1qsyc70t9kuaty1t9y','update','property','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('c2tf70omkboknk08wnz7cpsx','delete','property','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('wwn8bjfhsm348enp1pqxq00x','delete','property','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('m37zmapok5ek9xjthyg2wz5h','create','unit','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('cslbiiuez6rbfr5b5fsyas35','create','unit','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('iem5ozjve571jvdsh5ay2654','read','unit','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('z5a9avjilol0vuvqnn3m1bbp','read','unit','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('riietaj930l4tg8w3gfcajbm','update','unit','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('m102tpsrszpn7fpw8inqajh2','update','unit','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('qpoga48dqxxvhd4r1g1g6732','delete','unit','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('ea989cmuhvwq8chxc1xyurvy','delete','unit','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('ki00ocu3j265g76m20bliroz','create','asset','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('z04d7q0bskdt75zm83r3cl4z','create','asset','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('s8a6o9l9ew4iskkncdewsozb','read','asset','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('rgndscmyzr35c22tndcxb36b','read','asset','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('p1axuyem4u8l8x3k3wdn551f','update','asset','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('xdha6o039xxd1oot6l4f73c8','update','asset','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('ecqoxyirqtx2lcuf9vzlujuv','delete','asset','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('x715jro0wbpgn34zm2f5w2ks','delete','asset','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('k20gk0neg4yryx300xm8xzqp','create','vendor','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('oa85ugqh5nxwor3ngb99m9r4','create','vendor','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('d9fburoqp046hkyxangipa28','read','vendor','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('n5ps0bf4ydg5o39bl382k1zb','read','vendor','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('uqhj901cy27xyka2tgn4yri4','update','vendor','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('cod9e04lxgbvr9i3n68a1gbn','update','vendor','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('q1lo3vyyh8xa5u85ks5d6rwn','delete','vendor','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('buq3wtytx43e7fvrkgh8zwxv','delete','vendor','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('yfs5x7rmmer7w7a20jeo70rn','create','document','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('htnjhl1q85ki33n8aksfz08y','create','document','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('zo8ysg2l3jc4bk9iqmozqjja','read','document','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('auo134tw23yy3v0lukd9u46s','read','document','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('ebeft3vpm3cn9cyac38h5fdb','update','document','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('jtbw9zmehq185h4402smfkmv','update','document','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('b0pw9m1mtltm4xh3na90nd46','delete','document','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('xfgmyn8b2d2h5nyn26y9x2fo','delete','document','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('r3iez9gf077asvqzei86y8ce','create','maintenance-request','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('ukq1zmm85z24pasrimqlz50f','create','maintenance-request','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('zyug3d8sdljxdw8ddxsz6ku3','read','maintenance-request','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('lxqm8dktj4n4neuotfvlwfu9','read','maintenance-request','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('kc40c1432ap4bzv3qc604gk2','update','maintenance-request','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('nvsgmifeff3bpzobpfmma7ao','update','maintenance-request','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('g1z69dce075e22o2sy0l58u0','delete','maintenance-request','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('v9eh1h5yg5dhtei9gzmw0q7s','delete','maintenance-request','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('f0ng5ks7we8jggsjoe33xuem','create','timeline-event','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('s8br0h0c93o33twuobcj2syd','create','timeline-event','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('kxitrnpog354zaal7xbgc1iy','read','timeline-event','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('jnfaly4kvh9hq39yxvzri6so','read','timeline-event','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('vxbczcq4y8jt5ed4za3pha5j','update','timeline-event','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('k3f7ydj25xanodzpgsxryv13','update','timeline-event','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('qxszelfn3y49dvbduaztko21','delete','timeline-event','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('h16r6lseuvxes67rdo2kt6mx','delete','timeline-event','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('rjp192m44dw13o7k1l5xb9lk','create','audit-log','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('c097ncupf25gh6300ypvtd2d','create','audit-log','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('uipt7u4ilv2dqitqpftojxco','read','audit-log','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('cnqfapzvr65pzsrpkd39xws4','read','audit-log','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('fanrkchcvstdhamz9j0d1aiw','update','audit-log','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('zq4sh3bhei0x4lmb3ke6y63x','update','audit-log','any','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('vz8izxiul1n1p94oc7bfb8vl','delete','audit-log','own','',1771237923302,1771237923302);
INSERT INTO Permission VALUES('lovo1ur3fxhv9ckd9r7fjx7w','delete','audit-log','any','',1771237923302,1771237923302);
INSERT INTO Role VALUES('xf5n3ymr5dpeptyn19chzcsq','owner','Organization owner',1771237923302,1771237923302);
INSERT INTO Role VALUES('kflf4puf00ujyjl7au1xs8m8','manager','Organization manager',1771237923302,1771237923302);
INSERT INTO Role VALUES('tfnuqb7ru1i20ba181djxdch','agent','Organization agent',1771237923302,1771237923302);
INSERT INTO Role VALUES('zu5r76vy9fyoiejp50vj81bc','vendor_readonly','Vendor read-only',1771237923302,1771237923302);
INSERT INTO _PermissionToRole VALUES('vq1zqeoisxuwxvlmnf9rk15j','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('oren36rwcxda3vnltwoqlkxt','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('jfb1s2zdsyy16nopqq4qn3cf','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('dnwmk3qcnnyrjl90xmce9odz','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('z6olewpvwoapnzpxn8b1nsjq','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('kasp9yasmtetr0w0fql2l3tc','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('l5nitvslnmmeajcvbfzst8bi','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('ym7jtspsfhhx9wz4typrvfcz','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('pajh2kcqv0yc2iilywetqxqu','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('u1ihyskpnv27c3oqag9l95yz','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('n87rjk1qsyc70t9kuaty1t9y','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('wwn8bjfhsm348enp1pqxq00x','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('cslbiiuez6rbfr5b5fsyas35','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('z5a9avjilol0vuvqnn3m1bbp','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('m102tpsrszpn7fpw8inqajh2','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('ea989cmuhvwq8chxc1xyurvy','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('z04d7q0bskdt75zm83r3cl4z','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('rgndscmyzr35c22tndcxb36b','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('xdha6o039xxd1oot6l4f73c8','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('x715jro0wbpgn34zm2f5w2ks','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('oa85ugqh5nxwor3ngb99m9r4','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('n5ps0bf4ydg5o39bl382k1zb','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('cod9e04lxgbvr9i3n68a1gbn','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('buq3wtytx43e7fvrkgh8zwxv','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('htnjhl1q85ki33n8aksfz08y','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('auo134tw23yy3v0lukd9u46s','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('jtbw9zmehq185h4402smfkmv','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('xfgmyn8b2d2h5nyn26y9x2fo','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('ukq1zmm85z24pasrimqlz50f','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('lxqm8dktj4n4neuotfvlwfu9','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('nvsgmifeff3bpzobpfmma7ao','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('v9eh1h5yg5dhtei9gzmw0q7s','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('s8br0h0c93o33twuobcj2syd','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('jnfaly4kvh9hq39yxvzri6so','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('k3f7ydj25xanodzpgsxryv13','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('h16r6lseuvxes67rdo2kt6mx','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('c097ncupf25gh6300ypvtd2d','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('cnqfapzvr65pzsrpkd39xws4','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('zq4sh3bhei0x4lmb3ke6y63x','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('lovo1ur3fxhv9ckd9r7fjx7w','xf5n3ymr5dpeptyn19chzcsq');
INSERT INTO _PermissionToRole VALUES('vq1zqeoisxuwxvlmnf9rk15j','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('oren36rwcxda3vnltwoqlkxt','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('jfb1s2zdsyy16nopqq4qn3cf','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('z6olewpvwoapnzpxn8b1nsjq','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('kasp9yasmtetr0w0fql2l3tc','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('l5nitvslnmmeajcvbfzst8bi','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('ym7jtspsfhhx9wz4typrvfcz','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('pajh2kcqv0yc2iilywetqxqu','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('u1ihyskpnv27c3oqag9l95yz','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('n87rjk1qsyc70t9kuaty1t9y','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('wwn8bjfhsm348enp1pqxq00x','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('cslbiiuez6rbfr5b5fsyas35','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('z5a9avjilol0vuvqnn3m1bbp','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('m102tpsrszpn7fpw8inqajh2','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('ea989cmuhvwq8chxc1xyurvy','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('z04d7q0bskdt75zm83r3cl4z','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('rgndscmyzr35c22tndcxb36b','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('xdha6o039xxd1oot6l4f73c8','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('x715jro0wbpgn34zm2f5w2ks','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('oa85ugqh5nxwor3ngb99m9r4','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('n5ps0bf4ydg5o39bl382k1zb','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('cod9e04lxgbvr9i3n68a1gbn','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('buq3wtytx43e7fvrkgh8zwxv','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('htnjhl1q85ki33n8aksfz08y','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('auo134tw23yy3v0lukd9u46s','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('jtbw9zmehq185h4402smfkmv','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('xfgmyn8b2d2h5nyn26y9x2fo','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('ukq1zmm85z24pasrimqlz50f','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('lxqm8dktj4n4neuotfvlwfu9','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('nvsgmifeff3bpzobpfmma7ao','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('v9eh1h5yg5dhtei9gzmw0q7s','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('s8br0h0c93o33twuobcj2syd','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('jnfaly4kvh9hq39yxvzri6so','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('k3f7ydj25xanodzpgsxryv13','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('h16r6lseuvxes67rdo2kt6mx','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('c097ncupf25gh6300ypvtd2d','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('cnqfapzvr65pzsrpkd39xws4','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('zq4sh3bhei0x4lmb3ke6y63x','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('lovo1ur3fxhv9ckd9r7fjx7w','kflf4puf00ujyjl7au1xs8m8');
INSERT INTO _PermissionToRole VALUES('oren36rwcxda3vnltwoqlkxt','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('kasp9yasmtetr0w0fql2l3tc','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('u1ihyskpnv27c3oqag9l95yz','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('z5a9avjilol0vuvqnn3m1bbp','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('rgndscmyzr35c22tndcxb36b','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('n5ps0bf4ydg5o39bl382k1zb','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('htnjhl1q85ki33n8aksfz08y','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('auo134tw23yy3v0lukd9u46s','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('jtbw9zmehq185h4402smfkmv','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('ukq1zmm85z24pasrimqlz50f','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('lxqm8dktj4n4neuotfvlwfu9','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('nvsgmifeff3bpzobpfmma7ao','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('s8br0h0c93o33twuobcj2syd','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('jnfaly4kvh9hq39yxvzri6so','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('k3f7ydj25xanodzpgsxryv13','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('cnqfapzvr65pzsrpkd39xws4','tfnuqb7ru1i20ba181djxdch');
INSERT INTO _PermissionToRole VALUES('oren36rwcxda3vnltwoqlkxt','zu5r76vy9fyoiejp50vj81bc');
INSERT INTO _PermissionToRole VALUES('g0blrtnrfyl5hvwoskrrvv6s','zu5r76vy9fyoiejp50vj81bc');
INSERT INTO _PermissionToRole VALUES('iem5ozjve571jvdsh5ay2654','zu5r76vy9fyoiejp50vj81bc');
INSERT INTO _PermissionToRole VALUES('s8a6o9l9ew4iskkncdewsozb','zu5r76vy9fyoiejp50vj81bc');
INSERT INTO _PermissionToRole VALUES('d9fburoqp046hkyxangipa28','zu5r76vy9fyoiejp50vj81bc');
INSERT INTO _PermissionToRole VALUES('zo8ysg2l3jc4bk9iqmozqjja','zu5r76vy9fyoiejp50vj81bc');
INSERT INTO _PermissionToRole VALUES('zyug3d8sdljxdw8ddxsz6ku3','zu5r76vy9fyoiejp50vj81bc');
INSERT INTO _PermissionToRole VALUES('kxitrnpog354zaal7xbgc1iy','zu5r76vy9fyoiejp50vj81bc');
