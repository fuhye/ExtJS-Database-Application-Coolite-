
// @source core/tree/WebServiceTreeLoader.js

Coolite.Ext.WebServiceTreeLoader = Ext.extend(Ext.tree.TreeLoader, {
    // private override
    processResponse : function (response, node, callback) {
        var xmlData = response.responseXML,
            root = xmlData.documentElement || xmlData,
            json = Ext.DomQuery.selectValue("json", root, "");

        try {
            var o = eval("(" + json + ")");
            
            node.beginUpdate();
            
            for (var i = 0, len = o.length; i < len; i++) {
                var n = this.createNode(o[i]);
                if (n) {
                    node.appendChild(n);
                }
            }
            
            node.endUpdate();
            
            if (typeof callback == "function") {
                callback(this, node);
            }
        } catch (e) {
            this.handleFailure(response);
        }
    }
});